# @atomist/sdm-pack-clojure

[![atomist sdm goals](http://badge.atomist.com/T29E48P34/atomist/sdm-pack-clojure/22172de5-0199-4283-a555-5f3b23ecfc5d)](https://app.atomist.com/workspace/T29E48P34)
[![npm version](https://img.shields.io/npm/v/@atomist/sdm-pack-clojure/next.svg)](https://www.npmjs.com/package/@atomist/sdm-pack-clojure/v/next)

[Atomist][atomist] software delivery machine (SDM) extension pack
providing automated creation, building, and delivery of
[Spring][spring] and [Spring Boot][spring-boot] applications.

See the [Atomist documentation][atomist-doc] for more information on
what SDMs are and what they can do for you using the Atomist API for
software.

[atomist-doc]: https://docs.atomist.com/ (Atomist Documentation)

## Usage

Install the dependency in your SDM project.

```
$ npm install @atomist/sdm-pack-clojure
```

Then use its exported method to add the functionality to your SDM in
your machine definition.

```typescript
import {
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
} from "@atomist/sdm";
import {
    createSoftwareDeliveryMachine,
} from "@atomist/sdm-core";
import { LeinSupport } from "@atomist/sdm-pack-clojure";

export function machine(configuration: SoftwareDeliveryMachineConfiguration): SoftwareDeliveryMachine {

    const sdm = createSoftwareDeliveryMachine(
        {
            name: "My Software Delivery Machine",
            configuration,
        },
        whenPushSatisfies(IsLein)
            .itMeans("fingerprint a clojure project")
            .setGoals(LeinDefaultBranchBuildGoals));

    sdm.addExtensionPacks(LeinSupport);
            
    return sdm;
};
```

## Goals

| goal      | long name  | clojure project best practice |
| :---      | :------    | :------------                 |
| leinBuild | Lein build | run leiningen build and return AppInfo according to leiningen project/version |
| autofix | cljformat | run the cljformat tool on all .clj files |
| version | lein-version | extract leiningen version, remove any "-SNAPSHOT", add branch-timestamp suffix, and update leiningen project version |
| dockerBuild | lein-docker-build | docker files are located at `docker/Dockerfile`, image name extracted from project.clj, and current version |
| publish | deploy-jar | run lein deploy, ensuring that the versioning policy is consistent and project.clj version is in sync with build.  Goal includes
                         a project listener to run our metajar preparation specific to how we construct docker images |

### Secrets

Secrets required during the build can be baked into each Repo or shared across all of the Repos.

```
    node node_modules/\@atomist/clj-editors/vault.js create key
    node node_modules/\@atomist/clj-editors/vault.js merge --data '{"CLOJARS_USERNAME": "xxxxx", "CLOJARS_PASSWORD": "xxxxxxx"}'
    node node_modules/\@atomist/clj-editors/vault.js read
```

The content of the `key.txt` is made available to running SDMs using the `TEAM_CRED` environment variable.

#### Deploying to Clojars

For releases, we add repositories to our leiningen project.clj file

```
:repositories [["releases" {:url "https://clojars.org/repo"
                              :username :env/clojars_username
                              :password :env/clojars_password
                              :sign-releases false}]]

```

And encrypt Clojars username/password into our vault.

#### Deploying Clojure service Docker container to Artifactory

This pack is configured to pick up and use any docker registry referenced in the atomist.config.ts file at `sdm.docker.jfrog`

```
{
    "sdm": {
        "docker": {
            "jfrog": {
                "registry": "",
                "user": "",
                "password": ""
            }
        }
    }
}
```

## Support

General support questions should be discussed in the `#support`
channel in the [Atomist community Slack workspace][slack].

If you find a problem, please create an [issue][].

[issue]: https://github.com/atomist/sdm-pack-clojure/issues

## Development

You will need to install [Node.js][node] to build and test this project.

[node]: https://nodejs.org/ (Node.js)

### Build and test

Install dependencies.

```
$ npm install
```

Use the `build` package script to compile, test, lint, and build the
documentation.

```
$ npm run build
```

### Release

Releases are handled via the [Atomist SDM][atomist-sdm].  Just press
the 'Approve' button in the Atomist dashboard or Slack.

[atomist-sdm]: https://github.com/atomist/atomist-sdm (Atomist Software Delivery Machine)

---

Created by [Atomist][atomist].
Need Help?  [Join our Slack workspace][slack].

[atomist]: https://atomist.com/ (Atomist - How Teams Deliver Software)
[slack]: https://join.atomist.com/ (Atomist Community Slack)
