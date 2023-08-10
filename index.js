const fs = require("fs");
const {input,confirm} = require("@inquirer/prompts");
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const Logger = require("@ptkdev/logger");
const logger = new Logger();

const convert_message = (content) => {
    let message = content;
    if (typeof content !== "string") {
        message = JSON.stringify(content);
    }
    if (message.includes("error")) {
        return { type: "error", content: message };
    }
    return { type: "debug", content: message };
}

const nscnf_path = (path) => `${path}/android/app/src/main/res/xml/network_security_config.xml`;
const lexp_path = (path) => `${path}/logExporter.js`;
const ip_address = () => new Promise((resolve, reject)=>{
    require('dns').lookup(require('os').hostname(), function (err, addr, fam) {
        if (err) return reject(err);
        resolve(addr);
    })
});

(async()=>{
    const ipaddr = await ip_address();
    let is_valid = false;
    while (!is_valid) {
        const app_path = await input({ message:"ESv2 Project Path?" });
        if (!fs.existsSync(app_path)) {
            logger.error("No such directory");
            continue;
        }
        if (!fs.existsSync(`${app_path}/index.js`)) {
            logger.error("No react-native index.js file found");
            continue;
        }
        let index_js_content = fs.readFileSync(`${app_path}/index.js`,{encoding:"utf8"});
        if (!index_js_content.includes(`require('./logExporter');`)) {
            logger.error("No log exporter definition found");
            continue;
        }

        logger.info("Network security config path",nscnf_path(app_path));
        logger.info("Log exporter path",lexp_path(app_path));

        let template_log_exporter = fs.readFileSync("./logExporter.template",{encoding:"utf8"});
        let template_network_sec_cnf = fs.readFileSync("./network_security_config.template",{encoding:"utf8"});

        template_log_exporter = template_log_exporter.replace("<ip_address>",ipaddr);
        template_network_sec_cnf = template_network_sec_cnf.replace("<ip_address>",ipaddr);

        logger.info(`Network security config  \n${template_network_sec_cnf}`);
        logger.info(`Log exporter changes  \n${template_log_exporter}`);

        const yes = await confirm({ message: 'Continue?' });
        if (yes) {
            fs.writeFileSync(lexp_path(app_path),template_log_exporter,{ encoding:"utf8" });
            fs.writeFileSync(nscnf_path(app_path),template_network_sec_cnf,{ encoding:"utf8" });

            logger.info("Done 🚀🚀");
            is_valid = true;
        } else {
            break;
        }
    }

    if (is_valid) {
        app.get("/", (req, res) => {
            res.sendFile(__dirname + '/index.html');
        });

        io.on("connection", (socket) => {
            logger.debug('incoming device... 🎉');
            socket.on("message",(message)=>{
                logger.debug(message);
                const {type, content} = convert_message(message);
                if (type === "info") {
                    logger.info(content);
                }
                if (type === "debug") {
                    logger.debug(content);
                }
                if (type === "error") {
                    logger.error(content);
                }
            });
        });
        io.on("disconnect",()=>{
            logger.info("device disconnected ❌❌");
        });
        server.listen(9091, () => {
            logger.info('log listening on *:9091 ✅✅');
        });
    } else {
        logger.error("Log listener is not running... ❌");
    }
})();
