const core = require("@actions/core");
const { execSync } = require("child_process");
const { exec } = require("@actions/exec");

const execOptions = {
  cwd: process.env.GITHUB_WORKSPACE,
};

// Support Functions
const createCatFile = ({ email, api_key }) => [
  "printf",
  `'machine api.heroku.com\nlogin ${email}\npassword ${api_key}\nmachine git.heroku.com\nlogin ${email}\npassword ${api_key}' >> .netrc`.split(
    " "
  ),
];

const deploy = async ({
  dontuseforce,
  app_name,
  branch,
  usedocker,
  dockerHerokuProcessType,
  appdir,
}) => {
  if (usedocker) {
    await exec(
      "heroku",
      `container:push ${dockerHerokuProcessType} --app ${app_name}`.split(" "),
      execOptions
    );
    await exec(
      "heroku",
      `container:release ${dockerHerokuProcessType} --app ${app_name}`.split(
        " "
      ),
      execOptions
    );
  } else {
    if (appdir === "") {
      const args = `push heroku ${branch}:refs/heads/master`.split(" ");
      if (!dontuseforce) {
        args.push("--force");
      }

      await exec("git", args, execOptions);
    } else {
      const args = ["push"];
      if (!dontuseforce) {
        args.push("--force");
      }
      args.push(
        `heroku 'git subtree split --prefix=${appdir} ${branch}':refs/heads/master`.split(
          " "
        )
      );

      await exec("git", args, execOptions);
    }
  }
};

const addRemote = async ({ app_name, buildpack }) => {
  try {
    await exec(
      "heroku",
      `git:remote --app ${app_name}`.split(" "),
      execOptions
    );
    console.log("Added git remote heroku");
  } catch (err) {
    const args = `create ${app_name}`.split(" ");
    if (buildpack) {
      args.push(`--buildpack ${buildpack}`.split(" "));
    }

    await exec("heroku", args, execOptions);
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
      const { stdout: isShallow } = await exec(
        "git rev-parse --is-shallow-repository",
        execOptions
      );

      // If the Repo clone is shallow, make it unshallow
      if (isShallow === "true\n") {
        await exec("git", "fetch --prune --unshallow".split(" "), execOptions);
      }
    }

    await exec(createCatFile(heroku)[0], createCatFile(heroku)[1], {
      cwd: "/",
    });
    execSync("cat ~/.netrc");
    console.log("Created and wrote to ~./netrc");

    await exec("heroku", "login".split(" "), execOptions);
    if (heroku.usedocker) {
      await exec("heroku", "container:login".split(" "), execOptions);
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
