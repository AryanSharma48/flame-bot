import getProjectStructure from "./fileTree.js";

export default function getDefaultContent(section, projectType, context = {}) {
    const {
        packages = [],
        dependencies = [],
        scripts = new Map(),
        fileTree = null,
        licenseName = "",
        username = "Unknown",
        projectName = "this project",
        isMonorepo = false,
    } = context ?? {};

    const safeProjectType = projectType || "unknown";
    const safeSection = (section || "").toLowerCase().trim();

    switch (safeSection) {
        case "description":
            return getDescriptionContent(safeProjectType, projectName, isMonorepo);
        case "installation":
            return getInstallationContent(safeProjectType, packages, isMonorepo);
        case "usage":
            return getUsageContent(safeProjectType, scripts, isMonorepo);
        case "dependencies":
            return getDependenciesContent(dependencies, packages);
        case "folder structure":
            return getFolderStructureContent(fileTree);
        case "license":
            return getLicenseContent(licenseName);
        case "built by":
            return `Built with ❤️ by @${(username || "Unknown").trim()}`;
        default:
            return "";
    }
}

function getDescriptionContent(projectType, projectName, isMonorepo) {
    const name = projectName || "this project";
    if (projectType === "node") {
        if (isMonorepo) {
            return `${name} is a Node.js monorepo containing multiple packages. Add a brief description of its purpose and what problem it solves.`;
        }
        return `${name} is a Node.js application. Add a brief description of its purpose and what problem it solves.`;
    }
    if (projectType === "python") return `${name} is a Python project. Add a brief description of its purpose and what problem it solves.`;
    return `${name} - Add a brief description of your project, its purpose, and what problem it solves.`;
}

function getInstallationContent(projectType, packages, isMonorepo) {
    if (projectType === "node") {
        if (isMonorepo && packages.length > 1) {
            const packageList = packages
                .map(pkg => {
                    const dir = pkg.path === "package.json" ? "(root)" : pkg.path.replace("/package.json", "");
                    return `- \`${dir}\``;
                })
                .join("\n");

            return `This is a monorepo with multiple packages:\n\n${packageList}\n\nTo install all dependencies:\n\n\`\`\`bash\n# Install root dependencies\nnpm install\n\n# Or install dependencies in each package\n${packages.map(pkg => {
                const dir = pkg.path === "package.json" ? "." : pkg.path.replace("/package.json", "");
                return `cd ${dir} && npm install`;
            }).join("\n")}\n\`\`\``;
        }
        return "Follow these steps to install the project:\n\n```bash\nnpm install\n```";
    }
    if (projectType === "python") return "Install dependencies using:\n\n```bash\npip install -r requirements.txt\n```";
    return "Add installation instructions here.";
}

function getUsageContent(projectType, scripts, isMonorepo) {
    if (projectType === "node") {
        if (scripts instanceof Map && scripts.size > 0) {
            const scriptEntries = [];

            for (const [name, locations] of scripts) {
                if (isMonorepo && locations.length > 1) {
                    const packageNames = locations.map(l => l.package).join(", ");
                    scriptEntries.push(`- \`npm run ${name}\` (available in: ${packageNames})`);
                } else if (locations.length === 1) {
                    const prefix = isMonorepo ? ` (in ${locations[0].package})` : "";
                    const cmd = name === "start" ? "npm start" : `npm run ${name}`;
                    scriptEntries.push(`- \`${cmd}\`${prefix}`);
                } else {
                    scriptEntries.push(`- \`npm run ${name}\``);
                }
            }

            return `You can run the following scripts:\n\n${scriptEntries.join("\n")}`;
        }
        return "Run the project using:\n\n```bash\nnpm start\n```";
    }
    if (projectType === "python") return "Run the project using:\n\n```bash\npython main.py\n```";
    return "Add usage instructions here.";
}

function getDependenciesContent(dependencies, packages) {
    if (dependencies && dependencies.length > 0) {
        const isMonorepo = packages && packages.length > 1;
        const header = isMonorepo
            ? `This project uses the following dependencies (across ${packages.length} packages):\n\n`
            : "This project uses the following dependencies:\n\n";

        return header + dependencies.map(d => `- ${d}`).join("\n");
    }
    return "No dependencies found.";
}

function getLicenseContent(licenseName) {
    if (licenseName) {
        return `This project is licensed under the ${licenseName}. See the LICENSE file for details.`;
    }
    return "Add your license information here.";
}

function getFolderStructureContent(fileTree) {
    if (!fileTree || typeof fileTree !== "object" || Object.keys(fileTree).length === 0) {
        return "Project structure:\n\n```\n(No file tree provided)\n```";
    }
    return "Project structure:\n\n" + getProjectStructure(fileTree);
}
