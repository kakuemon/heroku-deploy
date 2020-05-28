const core = require("@actions/core");
const { exec } = require("@actions/exec");
const fs = require("fs");
const util = require("util");

const writeFile = util.promisify(fs.writeFile);

const execOptions = {
  cwd: process.env.GITHUB_WORKSPACE,
};

// Support Functions
const createCatFile = ({ email, api_key }) => `
machine api.heroku.com
    login ${email}
    password ${api_key}
machine git.heroku.com
    login ${email}
    password ${api_key}
`;

const deploy = async ({
  dontuseforce,
  app_name,
  branch,
  usedocker,
  dockerHerokuProcessType,
  appdir,
}) => {
  const force = !dontuseforce ? "--force" : "";

  if (usedocker) {
    await exec(
      `heroku container:push ${dockerHerokuProcessType} --app ${app_name}`,
      execOptions
    );
    await exec(
      `heroku container:release ${dockerHerokuProcessType} --app ${app_name}`,
      execOptions
    );
  } else {
    if (appdir === "") {
      await exec(
        `git push heroku ${branch}:refs/heads/master ${force}`,
        execOptions
      );
    } else {
      await exec(
        `git push ${force} heroku \`git subtree split --prefix=${appdir} ${branch}\`:refs/heads/master`,
        execOptions
      );
    }
  }
};

const addRemote = async ({ app_name, buildpack }) => {
  try {
    await exec("heroku git:remote --app " + app_name, execOptions);
    console.log("Added git remote heroku");
  } catch (err) {
    await exec(
      "heroku create " +
        app_name +
        (buildpack ? " --buildpack " + buildpack : ""),
      execOptions
    );
    console.log("Successfully created a new heroku app");
  }
};

// Input Variables
let heroku = {};
heroku.api_key = core.getInput("heroku_api_key");
heroku.email = core.getInput("heroku_email");
heroku.app_name = core.getInput("heroku_app_name");
heroku.buildpack = core.getInput("buildpack");
heroku.branch = core.getInput("branch");
heroku.dontuseforce = core.getInput("dontuseforce") === "true" ? true : false;
heroku.usedocker = core.getInput("usedocker") === "true" ? true : false;
heroku.dockerHerokuProcessType = core.getInput("docker_heroku_process_type");
heroku.appdir = core.getInput("appdir");

(async () => {
  // Program logic
  try {
    // Check if using Docker
    if (!heroku.usedocker) {
      // Check if Repo clone is shallow
      const isShallow = await exec(
        "git rev-parse --is-shallow-repository",
        execOptions
      );

      // If the Repo clone is shallow, make it unshallow
      if (isShallow.toString() === "true\n") {
        await exec("git fetch --prune --unshallow", execOptions);
      }
    }

    await writeFile("/.netrc", createCatFile(heroku));
    console.log("Created and wrote to ~./netrc");

    await exec("heroku login", execOptions);
    if (heroku.usedocker) {
      await exec("heroku container:login", execOptions);
    }
    console.log("Successfully logged into heroku");

    addRemote(heroku);

    try {
      deploy({ ...heroku, dontuseforce: true });
    } catch (err) {
      console.error(`
            Unable to push branch because the branch is behind the deployed branch. Using --force to deploy branch. 
            (If you want to avoid this, set dontuseforce to 1 in with: of .github/workflows/action.yml. 
            Specifically, the error was: ${err}
        `);

      deploy(heroku);
    }

    core.setOutput(
      "status",
      "Successfully deployed heroku app from branch " + heroku.branch
    );
  } catch (err) {
    core.setFailed(err.toString());
  }
})();
