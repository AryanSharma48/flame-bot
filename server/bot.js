import { getOctokit } from "./github.js";
import processReadme from "../src/processReadme.js";

export async function runBot(payload) {
    try {
        const installationId = payload.installation.id;
        const owner = payload.repository.owner.login;
        const repo = payload.repository.name;

        const octokit = await getOctokit(installationId);

        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: "README.md",
        });

        const content = Buffer.from(data.content, "base64").toString();

        // Try to load package.json for context
        let packageJson = null;

        try {
            const pkg = await octokit.repos.getContent({
                owner,
                repo,
                path: "package.json",
            });

            packageJson = JSON.parse(
                Buffer.from(pkg.data.content, "base64").toString()
            );
        } catch { }

        const context = {
            packageJson,
            fileTree: null, // later upgrade
            username: owner,
        };

        const projectType = packageJson ? "node" : "unknown";
        const newReadme = processReadme(content, projectType, context);

        if (newReadme === content) {
            console.log("No changes needed");
            return;
        }

        // Commit updated README back to repo
        await octokit.repos.createOrUpdateFileContents({
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