/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { LocalProject } from "@atomist/automation-client";
import {
    applyFingerprint,
    cljFunctionFingerprints,
    leinCoordinates,
    leinDeps,
    logbackFingerprints,
    renderProjectLibDiff,
} from "@atomist/clj-editors";
import { DefaultTargetDiffHandler, Feature } from "@atomist/sdm-pack-fingerprints";

export const Logback: Feature = {
    displayName: "Logback",
    name: "elk-logback",
    extract: p => logbackFingerprints((p as LocalProject).baseDir),
    apply: (p, fp) => applyFingerprint((p as LocalProject).baseDir, fp),
    selector: fp => fp.name === "elk-logback",
    toDisplayableFingerprint: fp => fp.name,
    workflows: [
        DefaultTargetDiffHandler,
    ],
};

export const LeinDeps: Feature = {
    displayName: "Lein dependencies",
    name: "clojure-project-deps",
    extract: p => leinDeps((p as LocalProject).baseDir),
    apply: (p, fp) => applyFingerprint((p as LocalProject).baseDir, fp),
    selector: fp => fp.type && fp.type === LeinDeps.name,
    toDisplayableFingerprint: fp => fp.name,
    summary: renderProjectLibDiff,
    workflows: [
        DefaultTargetDiffHandler,
    ],
};

export const LeinCoordinates: Feature = {
    displayName: "Lein Project Coordinates",
    name: "clojure-project-coordinates",
    extract: p => leinCoordinates((p as LocalProject).baseDir),
    apply: (p, fp) => applyFingerprint((p as LocalProject).baseDir, fp),
    selector: fp => fp.name === LeinCoordinates.name,
    toDisplayableFingerprint: fp => fp.name,
    summary: renderProjectLibDiff,
};

export const CljFunctions: Feature = {
    displayName: "Clojure Functions",
    name: "public-defn-bodies",
    extract: p => cljFunctionFingerprints((p as LocalProject).baseDir),
    apply: (p, fp) => applyFingerprint((p as LocalProject).baseDir, fp),
    selector: fp => fp.type && fp.type === "public-defn-bodies",
    toDisplayableFingerprint: fp => fp.name,
    workflows: [
        DefaultTargetDiffHandler,
    ],
};
