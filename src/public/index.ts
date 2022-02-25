async function app(event: any) {
    return {
        body: JSON.stringify(
            {
                app: "APP Cognito", version: '1.0.0.1'
            }
        ),
        statusCode: 200,
    };
}

module.exports = { app };