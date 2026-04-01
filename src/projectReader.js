import fs from "fs";

export function detectProjectType() {

    if (fs.existsSync("package.json")) {
        return "node";
    }

    if (fs.existsSync("requirements.txt")) {
        return "python";
    }

    return "unknown";
}

export function getDependencies() {
    if (!fs.existsSync("package.json")) return [];

    try {
        const data = JSON.parse(fs.readFileSync("package.json", "utf-8"));
        return Object.keys(data.dependencies || {});
    } catch (err) {
        return [];
    }
}

export function getScripts() {
    if (!fs.existsSync("package.json")) return [];

    try {
        const data = JSON.parse(fs.readFileSync("package.json", "utf-8"));
        return Object.keys(data.scripts || {});
    } catch (err) {
        return [];
    }
}