import { getOctokit } from "./github.js";
import processReadme from "../src/processReadme.js";

async function findProjectFiles(octokit, owner, repo) {
    try {
        const { data: repoData } = await octokit.request("GET /repos/{owner}/{repo}", {
            owner,
            repo,
        });
        const defaultBranch = repoData.default_branch;

        const { data: treeData } = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
            owner,
            repo,
            tree_sha: defaultBranch,
            recursive: "true",
        });

        const packageJsonPaths = treeData.tree
            .filter(item =>
                item.type === "blob" &&
                item.path.endsWith("package.json") &&
                !item.path.includes("node_modules/")
            )
            .map(item => item.path);

        const requirementsPaths = treeData.tree
            .filter(item =>
                item.type === "blob" &&
                item.path.endsWith("requirements.txt") &&
                !item.path.includes("node_modules/") &&
                !item.path.includes(".git/") &&
                !item.path.includes("venv/") &&
                !item.path.includes(".venv/")
            )
            .map(item => item.path);

        return { packageJsonPaths, requirementsPaths, treeData };
    } catch (err) {
        console.error("Error scanning repository tree:", err.message);
        return { packageJsonPaths: [], requirementsPaths: [], treeData: null };
    }
}

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

async function fetchRequirementsFile(octokit, owner, repo, path) {
    try {
        const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner,
            repo,
            path,
        });
        const content = Buffer.from(data.content, "base64").toString();
        return { path, content, error: null };
    } catch (err) {
        console.warn(`Failed to fetch ${path}:`, err.message);
        return { path, content: null, error: err.message };
    }
}

function findLicensePath(treeData) {
    const licenseEntry = treeData?.tree?.find(item =>
        item.type === "blob" &&
        /^LICENSE(?:\.[^/]+)?$/i.test(item.path)
    );

    return licenseEntry?.path || null;
}

function getLicenseName(licenseContent) {
    const firstLine = licenseContent
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean);

    return firstLine || "";
}

async function fetchLicenseName(octokit, owner, repo, treeData) {
    const licensePath = findLicensePath(treeData);

    if (!licensePath) {
        return "";
    }

    try {
        const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner,
            repo,
            path: licensePath,
        });

        const content = Buffer.from(data.content, "base64").toString();
        return getLicenseName(content);
    } catch (err) {
        console.warn(`Failed to fetch license file ${licensePath}:`, err.message);
        return "";
    }
}

function aggregateDependencies(packages) {
    const ignoreList = [
        'eslint', 'prettier', 'husky', 'lint-staged', 'stylelint',
        'typescript', 'vite', 'webpack', 'rollup', 'parcel', 'esbuild',
        'babel', 'tsc', 'ts-node', 'tsx', 'nodemon', 'concurrently',
        'jest', 'mocha', 'chai', 'vitest', 'cypress', 'playwright', 'supertest',
        'postcss', 'autoprefixer', 'sass', 'less', 'dotenv', 'cross-env', 'rimraf',
        'black', 'flake8', 'pylint', 'mypy', 'isort', 'autopep8', 'bandit',
        'pytest', 'coverage', 'tox', 'mock', 'hypothesis', 'pytest-cov',
        'setuptools', 'wheel', 'twine', 'build',
        'python-dotenv', 'pip-tools', 'virtualenv', 'pre-commit'
    ];

    const depsSet = new Set();

    for (const pkg of packages) {
        const { content } = pkg;
        if (content?.dependencies) {
            Object.keys(content.dependencies).forEach(dep => {
                if (dep.startsWith('@types/')) return;
                if (dep.startsWith('@babel/')) return;
                if (dep.startsWith('@vitejs/')) return;
                if (dep.startsWith('types-')) return;
                if (ignoreList.includes(dep)) return;
                depsSet.add(dep);
            });
        }
    }

    return Array.from(depsSet).sort();
}

function aggregatePythonDependencies(requirementFiles) {
    const depsSet = new Set();

    for (const file of requirementFiles) {
        if (!file?.content) continue;

        file.content
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith("#"))
            .filter(line => !line.startsWith("-"))
            .map(line => line.split(";")[0].trim())
            .map(line => line.split(/[=<>!~]/)[0].trim())
            .filter(Boolean)
            .forEach(dep => depsSet.add(dep));
    }

    return Array.from(depsSet).sort();
}

function buildFileTree(treeData, maxDepth = 4) {
    const fileTree = {};

    if (!treeData?.tree || !Array.isArray(treeData.tree)) {
        return fileTree;
    }

    for (const item of treeData.tree) {
        if (
            item.path === "node_modules" ||
            item.path.startsWith("node_modules/") ||
            item.path === ".git" ||
            item.path.startsWith(".git/")
        ) {
            continue;
        }

        const parts = item.path.split("/");
        
        if (parts.length > maxDepth) {
            continue;
        }

        let current = fileTree;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const isFile = i === parts.length - 1 && item.type === "blob";

            if (isFile) {
                current[part] = null;
            } else {
                if (!current[part]) {
                    current[part] = {};
                }
                current = current[part];
            }
        }
    }

    return fileTree;
}

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

        const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
            owner,
            repo,
            path: "README.md",
        });

        const content = Buffer.from(data.content, "base64").toString();
        const { packageJsonPaths, requirementsPaths, treeData } = await findProjectFiles(octokit, owner, repo);
        const fileTree = treeData ? buildFileTree(treeData) : null;
        const packages = packageJsonPaths.length > 0
            ? (await Promise.all(packageJsonPaths.map(path => fetchPackageJson(octokit, owner, repo, path))))
                .filter(pkg => pkg.content !== null)
            : [];
        const requirementFiles = packages.length === 0 && requirementsPaths.length > 0
            ? (await Promise.all(requirementsPaths.map(path => fetchRequirementsFile(octokit, owner, repo, path))))
                .filter(file => file.content !== null)
            : [];
        const isNodeProject = packages.length > 0;
        const isPythonProject = !isNodeProject && requirementFiles.length > 0;
        const dependencies = isNodeProject
            ? aggregateDependencies(packages)
            : aggregatePythonDependencies(requirementFiles);
        const scripts = isNodeProject ? aggregateScripts(packages) : new Map();
        const projectType = isNodeProject ? "node" : (isPythonProject ? "python" : "unknown");
        const licenseName = await fetchLicenseName(octokit, owner, repo, treeData);

        const context = {
            packages: isNodeProject ? packages : requirementFiles,
            dependencies,
            scripts,
            fileTree,
            licenseName,
            username: owner,
            projectName: repo,
            isMonorepo: isNodeProject && packages.length > 1,
        };

        const newReadme = processReadme(content, projectType, context);

        if (newReadme === content) {
            console.log("No changes needed");
            return;
        }

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
