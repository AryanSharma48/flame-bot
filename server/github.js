import { App } from "@octokit/app";

//Returns an authenticated Octokit instance for a repository installation
export async function getOctokit(installationId) {
    const app = new App({
        appId: process.env.APP_ID,
        privateKey: process.env.PRIVATE_KEY,
    });

    return await app.getInstallationOctokit(installationId);
}