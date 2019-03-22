import { GitProject, logger } from "@atomist/automation-client";
import * as clj from "@atomist/clj-editors";
import { SpawnOptions } from "child_process";
import * as fs from "fs";
import * as _ from "lodash";
import * as path from "path";

/**
 * Add stuff from vault to env
 * @param options original options
 * @param project optional project
 */
export async function enrich(options: SpawnOptions = {}, project: GitProject): Promise<SpawnOptions> {
    const key = process.env.TEAM_CRED;
    const vault = path.join(fs.realpathSync(__dirname), "../resources/vault.txt");
    const defaultEncryptedEnv = { env: clj.vault(key, vault) };
    let encryptedEnv = {};
    try {
        encryptedEnv = { env: clj.vault(key, `${project.baseDir}/vault.txt`) };
    } catch {
        logger.info("no local encryptedEnv");
    }
    if (!options.cwd) {
        options.cwd = project.baseDir;
    }
    if (!options.env) {
        options.env = process.env;
    }
    const enriched = _.merge(options, defaultEncryptedEnv, encryptedEnv) as SpawnOptions;
    return enriched;
}
