import { App } from "@octokit/app";
import { Octokit } from "@octokit/rest";

export async function getOctokit(installationId) {
    const app = new App({
        appId: process.env.APP_ID,
        privateKey: process.env.PRIVATE_KEY,
    });

    const installationOctokit = await app.getInstallationOctokit(installationId);

    return new Octokit({
        auth: installationOctokit.auth,
    });
}