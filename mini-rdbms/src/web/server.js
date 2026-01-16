const app = require("./app");
const { bootRdbms, bootDemoSchema } = require("./services/rdbmsService");

bootRdbms();
bootDemoSchema();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Web backend running on http://localhost:${PORT}`);
});
