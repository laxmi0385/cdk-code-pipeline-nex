import { Construct } from "constructs";
import { accounts, mainRegion } from "../constant/account";
import { Dev } from "../Stages/Dev";
import { Production } from "../Stages/Production";
import {
  Stack,
  StackProps,
  aws_codebuild,
  aws_codecommit,
  aws_codepipeline,
  aws_codepipeline_actions,
} from "aws-cdk-lib";
import {
  CodePipeline,
  CodePipelineSource,
  ManualApprovalStep,
  ShellStep,
} from "aws-cdk-lib/pipelines";

const constants = {
  // Define your constants here
  REGION: "your-region",
  DEV_ACCOUNT_ID: "your-dev-account-id",
  CORE_VPC_PARAMETER_NAME: "your-core-vpc-parameter-name",
  CDK_APP_PYTHON_VERSION: "3.7",
  SECURITY_SCANNING_RESULT_DIR: "your-security-scanning-dir",
  SONARQUBE_SCAN_RESULT_OUTPUT_FILE: "sonarqube-scan-output-file",
  SONARQUBE_QUALITY_STATUS_OUTPUT_FILE: "sonarqube-quality-status-output-file",
  SONARQUBE_ISSUES_OUTPUT_FILE: "sonarqube-issues-output-file",
  OWASP_DEPENDENCY_CHECK_OUTPUT_FILE: "owasp-dependency-check-output-file",
  FAIL_BUILD_FOR_SONAR_QUALITY_STATUS: false,
  CDK_APP_NAME: "your-app-name",
  DEV_ENV: { account: "your-dev-account-id", region: "your-region" },
};

const sonar_secret = {
  // Define your SonarQube secret information here
  secret_full_arn: "your-sonar-secret-arn",
};

const sonarqube_secret_arn = "your-sonar-secret-arn";
export class CodePipelineStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // const buildSpec = aws_codebuild.BuildSpec.fromObject({
    //     env: {
    //       'secrets-manager': {
    //         LOGIN: `${sonar_secret.secret_full_arn}:access_token`,
    //         HOST: `${sonar_secret.secret_full_arn}:host`,
    //         PROJECT: `${sonar_secret.secret_full_arn}:project`,
    //       },
    //       variables: {
    //         SECURITY_SCANNING_OUTPUT_DIR: constants.SECURITY_SCANNING_RESULT_DIR,
    //         SONAR_SCAN_OUTPUT_FILE: constants.SONARQUBE_SCAN_RESULT_OUTPUT_FILE,
    //         SONAR_QUALITY_STATUS_OUTPUT_FILE: constants.SONARQUBE_QUALITY_STATUS_OUTPUT_FILE,
    //         SONAR_ISSUES_OUTPUT_FILE: constants.SONARQUBE_ISSUES_OUTPUT_FILE,
    //         OWASP_DEPENDENCY_CHECK_OUTPUT_FILE: constants.OWASP_DEPENDENCY_CHECK_OUTPUT_FILE,
    //         FAIL_BUILD_FOR_SONAR_QUALITY_STATUS: constants.FAIL_BUILD_FOR_SONAR_QUALITY_STATUS,
    //       },
    //     },
    //     phases: {
    //       install: {
    //         'runtime-versions': {
    //           python: constants.CDK_APP_PYTHON_VERSION,
    //         },
    //         commands: ['./scripts/install_dependencies.sh', 'npm install', 'pip3 install -r requirements.txt'],
    //       },
    //       build: {
    //         commands: ['./scripts/run_tests.sh', 'npx cdk synth'],
    //       },
    //     },
    //     version: '0.2',
    //   });

    //   const synthAction = new aws_codebuild.CodeBuildStep('Build', {
    //     input: pipelines.CodePipelineSource.connection('your-repository-connection-name', 'your-repository-owner', 'your-repository-name'),
    //     partialBuildSpec: buildSpec,
    //     commands: [],
    //     rolePolicyStatements: [
    //       new aws_iam.PolicyStatement({
    //         actions: ['secretsmanager:DescribeSecret', 'secretsmanager:GetSecretValue'],
    //         resources: [sonarqube_secret_arn],
    //       }),
    //       new aws_iam.PolicyStatement({
    //         actions: ['ssm:GetParameter'],
    //         resources: [`arn:aws:ssm:${constants.REGION}:${constants.DEV_ACCOUNT_ID}:parameter${constants.CORE_VPC_PARAMETER_NAME}`],
    //       }),
    //     ],
    //     environment: {
    //       privileged: true,
    //     },
    //     cache: aws_codebuild.Cache.local(aws_codebuild.LocalCacheMode.DOCKER_LAYER),
    //   });

    const repo = aws_codecommit.Repository.fromRepositoryArn(
      this,
      id,
      `arn:aws:codecommit:${Stack.of(this).region}:${
        Stack.of(this).account
      }:amazonconnectpoc`
    );

    const project = new aws_codebuild.PipelineProject(this, 'CfnNagCheckProject', {
      buildSpec: aws_codebuild.BuildSpec.fromObject({
          version: '0.2',
          phases: {
              install: {
                  commands: [
                      'npm ci',  // Add npm ci for installing dependencies
                  ],
              },
              pre_build: {
                  commands: [
                      'npm i constructs',  // Add npm i constructs to install specific dependencies
                  ],
              },
              build: {
                  commands: [
                      'npm install -g cfn-nag',
                      'cfn_nag_scan --input-path .',
                  ],
              },
              post_build: {
                  commands: [
                      'npx cdk synth',  // Add npx cdk synth for generating CloudFormation templates
                  ],
              },
          },
      }),
  });

    const sourceOutput = new aws_codepipeline.Artifact();
    const cfnNagOutput = new aws_codepipeline.Artifact();

    // /**
    //  * The pipeline listen to changes in `repoName` and deploys the updated infrastructure defined in the stages
    //  */
    const pipeline = new aws_codepipeline.Pipeline(this, "Pipeline", {
      // pipelineName: "InfrastructurePipeline",
      // selfMutation: true,
      crossAccountKeys: false,
      // synth: new ShellStep("Synth", {
      //   input: CodePipelineSource.codeCommit(repo, "aws-cdk"),
      //   // commands: ['npm ci', 'npm i constructs', 'npx cdk synth', 'gem install cfn-nag', 'apt-get update -y', 'pip3 install cfn-lint', 'apt-get install -y python3-pip', 'cfn_nag_scan --input-path "./cft.yaml"', 'cfn-lint cft.yaml'],
      //   commands: ['npm ci', 'npm i constructs', 'npx cdk synth'],
      // })
      stages: [
        {
          stageName: "CodeCommit_Source",
          actions: [
            new aws_codepipeline_actions.CodeCommitSourceAction({
              actionName: "CodeCommit_Source",
              repository: repo,
              output: sourceOutput,
              branch: "aws-cdk",
            }),
          ],
        },
        {
          stageName: 'CfnNagCheck',
          actions: [
              new aws_codepipeline_actions.CodeBuildAction({
                  actionName: 'CfnNagCheck',
                  input: sourceOutput,
                  outputs: [cfnNagOutput],
                  project,
              }),
          ],
      },
      {
        stageName: 'ManualApproval',
        actions: [
            new aws_codepipeline_actions.ManualApprovalAction({
                actionName: 'ManualApproval',
                runOrder: 1, // Set the run order for the manual approval action
                additionalInformation: 'Please approve the deployment.',
            }),
        ],
    },
      ],
    });

    // const Devstage = pipeline.addStage(
    //   new Dev(this, "Dev", {
    //     env: { account: accounts.pipeline, region: mainRegion },
    //   })
    // );

    // Devstage

    // Devstage.addPre(new ManualApprovalStep("approval"));

    // const productionStage = pipeline.addStage(
    //   new Production(this, "Production", {
    //     env: { account: accounts.pipeline, region: mainRegion },
    //   })
    // );

    // productionStage.addPre(new ManualApprovalStep("approval"));

    // Build stage with SCA, SAST, cdk-diff, cfn-lint, and cfn-nag
    // const buildStage = pipeline.addStage({
    //   stageName: 'Build',
    // });

    // buildStage.addActions(new ShellStep('SCA-SAST-cdk-diff-cfn-lint-cfn-nag', {
    //   commands: [
    //     // SCA (Replace with your SCA tool's command)
    //     'npm audit',

    //     // SAST (Replace with your SAST tool's command)
    //     'your-sast-command',

    //     // cdk-diff
    //     'cdk diff --app "npx ts-node bin/app.ts"',

    //     // cfn-lint
    //     'cfn-lint your-cloudformation-template.yaml',

    //     // cfn-nag
    //     'cfn_nag_scan --input-path "your-cloudformation-template.yaml"',
    //   ],
    // }));

    // const buildSpec = aws_codebuild.BuildSpec.fromObject({
    //   env: {
    //     // 'secrets-manager': {
    //     //   LOGIN: `${sonar_secret.secret_full_arn}:access_token`,
    //     //   HOST: `${sonar_secret.secret_full_arn}:host`,
    //     //   PROJECT: `${sonar_secret.secret_full_arn}:project`,
    //     // }
    //   },
    //   version: '0.2',
    //   phases: {
    //     install: {
    //       'runtime-versions': {
    //         python: constants.CDK_APP_PYTHON_VERSION,
    //       },
    //       commands: ['./scripts/install_dependencies.sh', 'npm install', 'pip3 install -r requirements.txt'],
    //     },
    //     build: {
    //       commands: ['./scripts/run_tests.sh', 'npx cdk synth'],
    //     },
    //     version: '0.2',
    //   },
    // })

    // const synth = new CodeBuildStep("build", {
    //   input: pipelines.CodePipelineSource.codeCommit(repo, "aws-cdk"),
    //   partialBuildSpec: buildSpec,
    //   commands: [],
    //   env: {
    //     privileged: "true",
    //   },
    //   cache: aws_codebuild.Cache.local(aws_codebuild.LocalCacheMode.DOCKER_LAYER),

    // })
  }
}
