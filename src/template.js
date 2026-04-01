import fs from "fs";
import { getDependencies, getScripts } from "./projectReader.js";
import getProjectStructure from "./fileTree.js";

export default function getDefaultContent(section, projectType) {
    switch (section) {
        case "description":
            return "A brief description of your project, its purpose, and what problem it solves.";

        case "installation":
            if (projectType === "node") {
                return "Follow these steps to install the project:\n\n```bash\nnpm install\n```";
            }
            if (projectType === "python") {
                return "Install dependencies using:\n\n```bash\npip install -r requirements.txt\n```";
            }
            return "Add installation instructions here.";

        case "usage":
            if (projectType === "node") {
                const scripts = getScripts();

                if (scripts.length > 0) {
                    const commands = scripts.map(script => {
                        return script === "start"
                            ? "npm start"
                            : `npm run ${script}`;
                    }).join("\n");

                    return `You can run the following scripts:\n\n\`\`\`bash\n${commands}\n\`\`\``;
                }

                // fallback if no scripts
                return "Run the project using:\n\n```bash\nnpm start\n```";
            }

            if (projectType === "python") {
                return "Run the project using:\n\n```bash\npython main.py\n```";
            }

            return "Add usage instructions here.";

        case "dependencies":
            const deps = getDependencies();

            if (deps.length > 0) {
                return "This project uses the following dependencies:\n\n" +
                    deps.map(dep => `- ${dep}`).join("\n");
            }

            return "No dependencies found.";

        case "folder structure":
            return "Project structure:\n\n" + getProjectStructure();

        case "license":
            return "This project is licensed under the MIT License.";

        case "built by":
            const username = process.env.GITHUB_ACTOR || "Aryan Sharma";
            return `Built with ❤️ by @${username}`;

        default:
            return "";
    }
}