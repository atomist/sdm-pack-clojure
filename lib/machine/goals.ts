import { Goal, IndependentOfEnvironment } from "../../node_modules/@atomist/sdm";

export const PublishGoal = new Goal({
    uniqueName: "Publish",
    environment: IndependentOfEnvironment,
    orderedName: "2-publish",
    displayName: "publish",
    workingDescription: "Publishing...",
    completedDescription: "Published",
    failedDescription: "Published failed",
});
