async function secure(event: any) {
    return {
        body: JSON.stringify(
            {
                username: "Sovandara.Uom", dob: '01/02/1900'
            }
        ),
        statusCode: 200,
    };
}

module.exports = { secure };