#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

import processReadme from '../src/processReadme.js';

const args = process.argv.slice(2);
const shouldShowHelp = args.includes('--help') || args.includes('-h');
const shouldInit = args.includes('--init');
const shouldForce = args.includes('--force');
const shouldUpdate = args.length === 0 || args.includes('--update');
const hasAction = shouldUpdate || shouldInit || shouldForce;

if (shouldShowHelp) {
    console.log('Usage: blytz [--update|--init|--force]');
    process.exit(0);
}

if (!hasAction) {
    console.log('Usage: blytz [--update|--init|--force]');
    process.exit(0);
}

function buildFileTree(dirPath, depth = 0, maxDepth = 4) {
    if (depth >= maxDepth) {
        return {};
    }

    const tree = {};
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
        .filter(entry => entry.name !== 'node_modules' && entry.name !== '.git')
        .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
            tree[entry.name] = buildFileTree(entryPath, depth + 1, maxDepth);
        } else {
            tree[entry.name] = null;
        }
    }

    return tree;
}

function collectDependencies(packageJson) {
    return Object.keys(packageJson.dependencies || {}).sort();
}

function collectPythonDependencies(requirementsContent) {
    return requirementsContent
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .filter(line => !line.startsWith('-'))
        .map(line => line.split(';')[0].trim())
        .map(line => line.split(/[=<>!~]/)[0].trim())
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));
}

function collectScripts(packageJson) {
    const scripts = new Map();

    for (const [name, command] of Object.entries(packageJson.scripts || {})) {
        scripts.set(name, [{ package: '(root)', command }]);
    }

    return scripts;
}

function getLicenseName(licenseContent) {
    const firstLine = licenseContent
        .split(/\r?\n/)
        .map(line => line.trim())
        .find(Boolean);

    return firstLine || '';
}

console.log("Scanning for project files...");

const targetDir = process.cwd();
const readmePath = path.join(targetDir, 'README.md');
const packageJsonPath = path.join(targetDir, 'package.json');
const requirementsPath = path.join(targetDir, 'requirements.txt');
const licensePath = path.join(targetDir, 'LICENSE');
const readmeExists = fs.existsSync(readmePath);
const hasPackageJson = fs.existsSync(packageJsonPath);
const hasRequirements = fs.existsSync(requirementsPath);
const hasLicense = fs.existsSync(licensePath);

if (!readmeExists && !shouldInit && !shouldForce) {
    console.error("Error: No README.md found in this directory. Try --init.");
    process.exit(1);
}

if (readmeExists && shouldInit && !shouldForce) {
    console.error("README.md already exists. Try --force.");
    process.exit(1);
}

if (!hasPackageJson && !hasRequirements) {
    console.error("Error: No package.json or requirements.txt found in this directory.");
    process.exit(1);
}

console.log("Files found. Processing README...");

try {
    if (shouldForce && readmeExists) {
        fs.unlinkSync(readmePath);
    }

    // 1. Read the raw text of both files
    const readmeContent = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf-8') : '';
    const fileTree = buildFileTree(targetDir);
    const projectName = path.basename(targetDir);
    const licenseName = hasLicense ? getLicenseName(fs.readFileSync(licensePath, 'utf-8')) : '';
    let context;
    let projectType;

    if (hasPackageJson) {
        const packageJsonData = fs.readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonData);

        context = {
            packageJson,
            packages: [{ path: 'package.json', content: packageJson }],
            dependencies: collectDependencies(packageJson),
            scripts: collectScripts(packageJson),
            fileTree,
            licenseName,
            username: packageJson.author || process.env.USERNAME || 'Unknown Author',
            projectName: packageJson.name || projectName,
            hasPackageJson: true,
            isMonorepo: false
        };
        projectType = 'node';
    } else {
        const requirementsContent = fs.readFileSync(requirementsPath, 'utf-8');

        context = {
            packages: [{ path: 'requirements.txt', content: requirementsContent }],
            dependencies: collectPythonDependencies(requirementsContent),
            scripts: new Map(),
            fileTree,
            licenseName,
            username: process.env.USERNAME || 'Unknown Author',
            projectName,
            hasPackageJson: false,
            isMonorepo: false
        };
        projectType = 'python';
    }

    // 3. Feed everything into your pure engine
    const updatedReadme = processReadme(readmeContent, projectType, context);

    // 4. Overwrite the existing README.md with the new content
    fs.writeFileSync(readmePath, updatedReadme, 'utf-8');

    console.log("Success! README.md has been auto-fixed.");

} catch (error) {
    console.error("An error occurred during processing:", error.message);
    process.exit(1);
}
