import fs from "fs";
import path from "path";

function generateTree(dir, prefix = "") {
    const files = fs.readdirSync(dir);

    let tree = "";

    files.forEach((file, index) => {
        // skip node_modules and .git
        if (file === "node_modules" || file === ".git") return;

        const fullPath = path.join(dir, file);
        const isLast = index === files.length - 1;

        const connector = isLast ? "└── " : "├── ";

        tree += `${prefix}${connector}${file}\n`;

        if (fs.statSync(fullPath).isDirectory()) {
            const newPrefix = prefix + (isLast ? "    " : "│   ");
            tree += generateTree(fullPath, newPrefix);
        }
    });

    return tree;
}

export default function getProjectStructure() {
    return "```\n" + generateTree(".") + "```";
}
