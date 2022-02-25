import * as cdk from 'aws-cdk-lib';
import {Stack, StackProps} from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from "path";
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigwv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigwv2Authorizers from '@aws-cdk/aws-apigatewayv2-authorizers-alpha';
import * as apigwv2Integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';

export class CdkAwsApiGatewaySecurityStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // create the user pool
        const userPool = new cognito.UserPool(this, 'userpool', {
            userPoolName: `my-user-pool`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            selfSignUpEnabled: true, // the types of authentication flows enabled for the client.
            signInAliases: {email: true},
            autoVerify: {email: true}, // specify attributes that Cognito will automatically request verification for, when a user signs up. Allowed values are email or phone.
            passwordPolicy: {
                minLength: 6,
                requireLowercase: false,
                requireDigits: false,
                requireUppercase: false,
                requireSymbols: false,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
        });

        const publicScope = new cognito.ResourceServerScope({
            scopeName: 'public',
            scopeDescription: 'Read-only access'
        });

        const secureScope = new cognito.ResourceServerScope({
            scopeName: 'secure',
            scopeDescription: 'Full access'
        });

        const resourceServer = userPool.addResourceServer('ResourceServer', {
            identifier: 'resource',
            scopes: [publicScope, secureScope],
        });

        userPool.addDomain('CognitoDomain', {
            cognitoDomain: {
                domainPrefix: 'client-credentials-demo',
            },
        });

        // The User Pool Client is the part of the User Pool, that enables unauthenticated operations like register / sign in / forgotten password.
        const readOnlyClient = new cognito.UserPoolClient(this, 'read-only-client', {
            userPool,
            authFlows: { // the types of authentication flows enabled for the client.
                adminUserPassword: true,
                userPassword: true,
                custom: true,
                userSrp: true,
            },
            oAuth: {
                scopes: [
                    cognito.OAuthScope.resourceServer(resourceServer, publicScope)
                ],
                flows: {
                    clientCredentials: true
                }
            },
            generateSecret: true,
            supportedIdentityProviders: [
                cognito.UserPoolClientIdentityProvider.COGNITO,
            ],
        });

        // client credential
        const fullAccessClient = new cognito.UserPoolClient(this, 'full-access-client', {
            userPool,
            authFlows: { // the types of authentication flows enabled for the client.
                adminUserPassword: true,
                userPassword: true,
                custom: true,
                userSrp: true,
            },
            oAuth: {
                scopes: [
                    cognito.OAuthScope.resourceServer(resourceServer, publicScope),
                    cognito.OAuthScope.resourceServer(resourceServer, secureScope)
                ],
                flows: {
                    clientCredentials: true
                }
            },
            generateSecret: true,
            supportedIdentityProviders: [
                cognito.UserPoolClientIdentityProvider.COGNITO,
            ],
        });

        // create the Authorizer - for grant access
        const authorizer = new apigwv2Authorizers.HttpUserPoolAuthorizer('user-pool-authorizer', userPool, {
                userPoolClients: [readOnlyClient, fullAccessClient],
            },
        );

        // create the lambda that sits behind the authorizer
        const secureLambda = new lambdaNodeJs.NodejsFunction(this, 'get-user-info-lambda', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'secure',
            entry: path.join(__dirname, `/../src/secure/index.ts`),
            bundling: {
                minify: true,
                externalModules: ['aws-sdk'],
            },
        });

        const publicLambda = new lambdaNodeJs.NodejsFunction(this, 'get-app-info-lambda', {
            runtime: lambda.Runtime.NODEJS_14_X,
            handler: 'app',
            entry: path.join(__dirname, `/../src/public/index.ts`),
            bundling: {
                minify: true,
                externalModules: ['aws-sdk'],
            },
        });

        // create the API
        const httpApi = new apigwv2.HttpApi(this, 'apigwv2-demo', {
            apiName: `http-api-demo`,
            description: 'HTTP API example'
        });

        // set the Authorizer on the Route
        httpApi.addRoutes({
            integration: new apigwv2Integrations.HttpLambdaIntegration('secure-fn-integration', secureLambda),
            path: '/api/secure',
            methods: [apigwv2.HttpMethod.GET],
            authorizer: authorizer,
            authorizationScopes: ['resource/secure']
        });

        httpApi.addRoutes({
            integration: new apigwv2Integrations.HttpLambdaIntegration('public-fn-integration', publicLambda),
            path: '/api/public',
            methods: [apigwv2.HttpMethod.GET],
            authorizer: authorizer,
            authorizationScopes: ['resource/public']
        });


        new cdk.CfnOutput(this, 'region', {value: cdk.Stack.of(this).region});
        new cdk.CfnOutput(this, 'userPoolId', {value: userPool.userPoolId});
        new cdk.CfnOutput(this, 'apiUrl', {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            value: httpApi.url!,
        });
    }

}
