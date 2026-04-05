import { getOctokit } from "./github.js";
import processReadme from "../src/processReadme.js";

/**
 * Scans the repository tree recursively to find all package.json files
 * Also returns the full tree data for building file tree
 */
async function findAllPackageJsonPaths(octokit, owner, repo) {
    try {
        // Get the default branch
        const { data: repoData } = await octokit.request("GET /repos/{owner}/{repo}", {
            owner,
            repo,
        });
        const defaultBranch = repoData.default_branch;

        // Get the tree recursively using request method
        const { data: treeData } = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
            owner,
            repo,
            tree_sha: defaultBranch,
            recursive: "true",
        });

        // Filter for package.json files (exclude node_modules)
        const packageJsonPaths = treeData.tree
            .filter(item =>
                item.type === "blob" &&
                item.path.endsWith("package.json") &&
                !item.path.includes("node_modules/")
            )
            .map(item => item.path);

        return { packageJsonPaths, treeData };
    } catch (err) {
        console.error("Error scanning repository tree:", err.message);
        return { packageJsonPaths: [], treeData: null };
    }
}

/**
 * Fetches and parses a single package.json file from the repository
 */
async function fetchPackageJson(octokit, owner, repo, path) {
    try {
        const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner,
            repo,
            path,
        });
        const content = JSON.parse(Buffer.from(data.content, "base64").toString());
        return { path, content, error: null };
    } catch (err) {
        console.warn(`Failed to fetch/parse ${path}:`, err.message);
        return { path, content: null, error: err.message };
    }
}

/**
 * Fetches all package.json files and returns a packages array along with file tree
 */
async function fetchAllPackages(octokit, owner, repo) {
    const { packageJsonPaths, treeData } = await findAllPackageJsonPaths(octokit, owner, repo);

    console.log(`Found ${packageJsonPaths.length} package.json files, treeData exists: ${!!treeData}`);

    // Build file tree from tree data
    const fileTree = treeData ? buildFileTree(treeData) : null;

    if (packageJsonPaths.length === 0) {
        return { packages: [], fileTree };
    }

    // Fetch all package.json files in parallel
    const results = await Promise.all(
        packageJsonPaths.map(path => fetchPackageJson(octokit, owner, repo, path))
    );

    // Filter out failed fetches
    const packages = results.filter(pkg => pkg.content !== null);

    return { packages, fileTree };
}

/**
 * Aggregates dependencies across all packages (deduplicated)
 */
function aggregateDependencies(packages) {
    const depsSet = new Set();

    for (const pkg of packages) {
        const { content } = pkg;
        if (content?.dependencies) {
            Object.keys(content.dependencies).forEach(dep => depsSet.add(dep));
        }
        if (content?.devDependencies) {
            Object.keys(content.devDependencies).forEach(dep => depsSet.add(dep));
        }
    }

    return Array.from(depsSet).sort();
}

/**
 * Builds a file tree object from the repository tree data
 */
function buildFileTree(treeData) {
    const fileTree = {};

    if (!treeData?.tree || !Array.isArray(treeData.tree)) {
        console.warn("Invalid tree data received");
        return fileTree;
    }

    for (const item of treeData.tree) {
        // Skip node_modules and .git directory (but not .gitignore, .github, etc.)
        if (
            item.path === "node_modules" ||
            item.path.startsWith("node_modules/") ||
            item.path === ".git" ||
            item.path.startsWith(".git/")
        ) {
            continue;
        }

        const parts = item.path.split("/");
        let current = fileTree;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isFile = i === parts.length - 1 && item.type === "blob";

            if (isFile) {
                current[part] = null; // Files are null leaves
            } else {
                if (!current[part]) {
                    current[part] = {};
                }
                current = current[part];
            }
        }
    }

    console.log(`Built file tree with ${Object.keys(fileTree).length} top-level entries`);
    return fileTree;
}

/**
 * Aggregates scripts across all packages (deduplicated, with package context)
 */
function aggregateScripts(packages) {
    const scriptsMap = new Map();

    for (const pkg of packages) {
        const { path, content } = pkg;
        const packageDir = path === "package.json" ? "(root)" : path.replace("/package.json", "");

        if (content?.scripts) {
            for (const [name, command] of Object.entries(content.scripts)) {
                if (!scriptsMap.has(name)) {
                    scriptsMap.set(name, []);
                }
                scriptsMap.get(name).push({ package: packageDir, command });
            }
        }
    }

    return scriptsMap;
}

export async function runBot(payload) {
    try {
        const installationId = payload.installation.id;
        const owner = payload.repository.owner.login;
        const repo = payload.repository.name;

        const octokit = await getOctokit(installationId);

        // Fetch README
        const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner,
            repo,
            path: "README.md",
        });

        const content = Buffer.from(data.content, "base64").toString();

        // Scan repository for all package.json files and build file tree
        const { packages, fileTree } = await fetchAllPackages(octokit, owner, repo);

        // Aggregate data from all packages
        const dependencies = aggregateDependencies(packages);
        const scripts = aggregateScripts(packages);

        // Determine project type based on presence of any package.json
        const projectType = packages.length > 0 ? "node" : "unknown";

        // Build context with multi-package support
        const context = {
            packages,
            dependencies,
            scripts,
            fileTree,
            username: owner,
            isMonorepo: packages.length > 1,
        };

        const newReadme = processReadme(content, projectType, context);

        if (newReadme === content) {
            console.log("No changes needed");
            return;
        }

        // Commit updated README back to repo
        await octokit.request("PUT /repos/{owner}/{repo}/contents/{path}", {
            owner,
            repo,
            path: "README.md",
            message: "Auto-update README",
            content: Buffer.from(newReadme).toString("base64"),
            sha: data.sha,
        });

        console.log("README updated successfully");

    } catch (err) {
        console.error("Bot error:", err.message);
    }
}