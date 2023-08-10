const fs = require("fs");
const {input,confirm, select} = require("@inquirer/prompts");
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const Logger = require("@ptkdev/logger");

const convert_message = (content) => {
    let message = content;
    if (typeof content === "object") {
        return { type: "info", content: JSON.stringify(message) };
    }
    if (typeof content !== "string") {
        message = JSON.stringify(content);
    }
    if (message.includes("warn:")) {
        return { type: "warning", content: message };
    }
    if (message.includes("error") || message.includes("fail")) {
        return { type: "error", content: message };
    }
    return { type: "debug", content: message };
}

const log_config = (dir) => ({
    language: "en",
    colors: true,
    debug: true,
    info: true,
    warning: true,
    error: true,
    sponsor: true,
    write: true,
    type: "log",
    rotate: {
        size: "10M",
        encoding: "utf8",
    },
    path: {
        debug_log: `${dir}/debug.log`,
        error_log: `${dir}/error.log`,
        info_log: `${dir}/info.log`
    },
    palette: {
        info: {
            label: "#ffffff",
            text: "#4CAF50",
            background: "#4CAF50"
        },
        warning: {
            label: "#ffffff",text: "#FF9800",background: "#FF9800"
        },
        error: {
            label: "#ffffff",text: "#FF5252",background: "#FF5252"
        },
        stackoverflow: {
            label: "#ffffff",text: "#9C27B0",background: "#9C27B0"
        },
        docs: {
            label: "#ffffff",text: "#FF4081",background: "#FF4081"
        },
        debug: {
            label: "#147efb",text: "#ffffff",background: "#ffffff"
        },
        sponsor: {
            label: "#ffffff",text: "#607D8B",background: "#607D8B"
        },
        time: {
            label: "#ffffff",background: "#147efb"
        }
    }
});

const lexp_content = (ip_address) => `if (__DEV__) {
    const socket_io = require("socket.io-client");
    global.socket = socket_io("http://${ip_address}:9091/",{ transports:["polling","websocket"],autoConnect: true });
    global.socket.on("connect_error",(err)=>{
        console.warn(JSON.stringify(err));
    });
    console.warn("‼️creating log-exporter");
}
`;

const nscnf_content = (ip_address) => `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config>
        <!-- Localhost config is NEEDED from react-native for the bundling to work  -->
        <domain-config cleartextTrafficPermitted="true">
            <domain includeSubdomains="true">127.0.0.1</domain>
            <domain includeSubdomains="true">${ip_address}</domain>
            <domain includeSubdomains="true">localhost</domain>
        </domain-config>

        <domain includeSubdomains="true">easysales.asia</domain>
        <trust-anchors>
            <certificates src="@raw/ca"/>
            <certificates src="system"/>
        </trust-anchors>
    </domain-config>
    <domain-config>
        <domain includeSubdomains="true">easyecosystem.com</domain>
        <trust-anchors>
            <certificates src="@raw/ecosystemca"/>
            <certificates src="system"/>
        </trust-anchors>
    </domain-config>
</network-security-config>
`;


const nscnf_path = (path) => `${path}/android/app/src/main/res/xml/network_security_config.xml`;
const lexp_path = (path) => `${path}/logExporter.js`;
const ip_address = () => {
    const interfaces = require('os').networkInterfaces();
    const addresses = [];
    for (const k in interfaces) {
        for (const k2 in interfaces[k]) {
            const address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    return addresses;
};

(async()=>{
    const log_dir = "./rn-esv2-logger-files";
    const ipAddress = ip_address();

    let logger = new Logger();
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

        ipAddress.push(" >.< ");
        let ipaddr = "";
        if (ipAddress.length === 1) {
            ipaddr = ipAddress[0];
        } else {
            const choices = [];
            for (let i = 0; i < ipAddress.length; i++) {
                choices.push({
                    name: ipAddress[i],
                    value: ipAddress[i],
                });
            }
            ipaddr = await select({
                message: 'Select your local IP address. 127.0.0.1 might not work every time.',
                choices: choices,
            });
        }

        logger.info("Network security config path",nscnf_path(app_path));
        logger.info("Log exporter path",lexp_path(app_path));

        let template_log_exporter = lexp_content(ipaddr);
        let template_network_sec_cnf = nscnf_content(ipaddr);

        logger.info(`Network security config  \n${template_network_sec_cnf}`);
        logger.info(`Log exporter changes  \n${template_log_exporter}`);

        const yes = await confirm({ message: 'Continue?' });
        if (yes) {
            fs.writeFileSync(lexp_path(app_path),template_log_exporter,{ encoding:"utf8" });
            fs.writeFileSync(nscnf_path(app_path),template_network_sec_cnf,{ encoding:"utf8" });

            if (!fs.existsSync(log_dir)) {
                fs.mkdirSync(log_dir);
            }

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

        logger = new Logger(log_config(log_dir));

        io.on("connection", (socket) => {
            logger.debug('incoming device... 🎉');
            socket.on("message",(message)=>{
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
                if (type === "warning") {
                    logger.warning(content);
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
