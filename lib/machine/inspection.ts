import { GitProject, NoParameters, Project, ProjectReview } from "@atomist/automation-client";
import { CodeInspection, execPromise, ExecPromiseResult, LoggingProgressLog, spawnLog, SpawnLogResult } from "@atomist/sdm";
import { enrich } from "./enrich";

export function runDependencyCheckOnProject(): CodeInspection<ProjectReview, NoParameters> {

    return async (p: Project) => {

        const project: GitProject = p as GitProject;

        const review: ProjectReview = { repoId: project.id, comments: [] };

        const spawnOptions = await enrich({}, project);

        const result: SpawnLogResult = await spawnLog(
            "lein",
            ["with-profile", "-dev", "dependency-check", "--throw"],
            {
                ...spawnOptions,
                log: new LoggingProgressLog("dependency-check"),
                cwd: project.baseDir,
            },
        );

        if (result.code !== 0) {
            review.comments.push({
                category: "OWasp Dependency Check failed",
                severity: "warn",
                detail: "please run `lein with-profile -dev dependency-check` to generate a new html report of the violation",
            });
        }

        return review;
    };
}

export function runConfusingDependenciesCheck(): CodeInspection<ProjectReview, NoParameters> {
    return async (p: Project) => {

        const project: GitProject = p as GitProject;

        const review: ProjectReview = {
            repoId: p.id,
            comments: [],
        };

        const spawnOptions = await enrich({}, project);

        const result: ExecPromiseResult = await execPromise(
            "lein",
            ["deps", ":tree"],
            {
                ...spawnOptions,
                cwd: project.baseDir,
            },
        );

        if (result.stderr.includes("confusing")) {
            review.comments.push({
                severity: "error",
                detail: result.stderr,
                category: "dependency confusion",
            });
        }

        return review;
    };
}
