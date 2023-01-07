const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');

let config = {}

if (fs.existsSync(path.join(__dirname, 'gitalk_init.json'))) {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'gitalk_init.json')).toString("utf-8"))
} else {
    // 配置信息
    config = {
        // GitHub repository 所有者，可以是个人或者组织。对应Gitalk配置中的owner
        username: process.env.GITHUB_REPOSITORY_OWNER,

        // 储存评论issue的github仓库名，仅需要仓库名字即可。对应 Gitalk配置中的repo
        repo: process.env.GITAK_INIT_REPO,

        // 从 GitHub 的 Personal access tokens 页面，点击 Generate new token
        token: process.env.GITALK_TOKEN,

        // 是否启用缓存，启用缓存会将已经初始化的数据写入配置的 outputCacheFile 文件，下一次直接通过缓存文件 outputCacheFile 判断
        cache: process.env.GITAK_INIT_CACHE || true,
        // 缓存文件输出的位置
        cacheFile: process.env.GITALK_INIT_CACHE_FILE || path.join(__dirname, './public/gitalk-init-cache.json'),

        // 只用于获取缓存的来源，缓存仍然会写到 cacheFile. 优先级 cacheFile > cacheRemote. 故有cacheFile的时候，忽略 cacheRemote
        cacheRemote: process.env.GITALK_INIT_CACHE_REMOTE || "http://127.0.0.1:4000/gitalk-init-cache.json",
        // 通过远程读取文件，这样就不需要在本地的博客源文件中保存(保存在静态站点的public中)
        // output 到 public 目的就是将文件放在静态站点里面，下一次构建时，可以从远程读取
    };
}

const hostname = "api.github.com"
const apiPath = '/repos/' + config.username + '/' + config.repo + '/issues';

const autoGitalkInit = {
    gitalkCache: null,
    getFiles: function (dir, files_) {
        files_ = files_ || [];
        let files = fs.readdirSync(dir);
        for (let i in files) {
            let name = dir + '/' + files[i];
            if (fs.statSync(name).isDirectory()) {
                this.getFiles(name, files_);
            } else {
                if (name.endsWith(".md")) {
                    files_.push(name);
                }
            }
        }
        return files_;
    },
    readItem: async function (file) {
        const fileStream = fs.createReadStream(file);

        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });
        // Note: we use the crlfDelay option to recognize all instances of CR LF
        // ('\r\n') in input.txt as a single line break.

        let start = false;

        let post = {};

        for await (const line of rl) {
            if (start === true) {
                if (line.trim() === "---") {
                    break
                } else {
                    let items = line.split(":")
                    if (["title", "desc", "date", "comment"].indexOf(items[0].trim()) !== -1) {
                        post[items[0].trim()] = items[1].trim()
                    }
                }
            } else {
                if (line.trim() === "---") {
                    start = true
                }
            }
        }

        fileStream.close()

        if (Object.keys(post).length === 0) {
            console.log(`gitalk: warn read empty from: ${file}`);

            return null
        }
        if (post["comment"] === false || post["comment"] === "false") {
            console.log(`gitalk: ignore by comment = ${post["comment"]} : ${file}`);
            return null
        }

        if (!("title" in post)) {
            console.log(`gitalk: ignore because the title miss: ${file}`);
            return null
        }

        if (!("date" in post)) {
            console.log(`gitalk: ignore because the date miss: ${file}`);
            return null
        }

        const regex = /^\d{4}-\d{2}-\d{2} \d{2}$/gm;

        if (!(regex.test(post['date']))) {
            console.log(`gitalk: ignore because the date ${post['date']} invalid: ${file}`);
            return false;
        }

        // url year/month/day/file
        post['url'] = "/" + post['date'].substring(0, 10).replace(/[-|\s]/g, "/") + `/${path.basename(file, ".md")}/`
        post['desc'] = post['title']

        delete post['date']
        return post
    },

    readItems: async function (dir) {
        let posts = [];
        for (let file of this.getFiles(dir)) {
            let post = await this.readItem(file);
            if (post != null) {
                posts.push(post)
            }
        }

        return posts
    },

    // 初始化
    gitalkInitInvoke: function ({url, id, title, desc}) {
        let options = {
            'method': 'POST',
            'hostname': hostname,
            'path': apiPath,
            'headers': {
                'Authorization': 'token ' + config.token,
                'Content-Type': 'application/json',
                'User-Agent': config.username + '/' + config.repo,
            },
            'maxRedirects': 20
        };

        let link = `https://${config.repo}${url}`

        //创建issue
        const reqBody = {
            'title': title,
            'labels': ['Gitalk', id],
            'body': `[${link}](${link}})\r\n\r\n${desc}`
        };

        return new Promise(resolve => {
            let req = https.request(options, function (res) {
                let chunks = [];

                res.on("data", function (chunk) {
                    chunks.push(chunk);
                });

                res.on("end", function () {
                    console.log(Buffer.concat(chunks).toString())

                    return resolve([false, true]);
                });

                res.on("error", function (error) {
                    return resolve([error, false]);
                });
            });

            req.write(JSON.stringify(reqBody))

            req.end();
        })
    },

    /**
     * 通过以请求判断是否已经初始化
     * @param {string} id gitalk 初始化的id
     * @return {Promise<[boolean, boolean]>} 第一个值表示是否出错，第二个值 false 表示没初始化， true 表示已经初始化
     */
    getIsInitByRequest: function (id) {

        let options = {
            'method': 'GET',
            'hostname': hostname,
            'path': apiPath + '?labels=Gitalk,' + id,
            'headers': {
                'Authorization': 'token ' + config.token,
                'Accept': 'application/json',
                // https://docs.github.com/en/rest/overview/resources-in-the-rest-api?apiVersion=2022-11-28#user-agent-required
                'User-Agent': config.username + '/' + config.repo,
            },
            'maxRedirects': 20
        };

        return new Promise((resolve) => {
            let req = https.request(options, function (res) {
                let chunks = [];

                res.on("data", function (chunk) {
                    chunks.push(chunk);
                });

                res.on("end", function () {
                    const res = JSON.parse(Buffer.concat(chunks).toString());
                    if (res.length > 0) {
                        return resolve([false, true]);
                    } else {
                        return resolve([false, false]);
                    }
                });

                res.on("error", function (error) {
                    return resolve([error, false]);
                });
            });

            req.end();
        })
    },

    // 根据缓存，判断链接是否已经初始化
    // 第一个值表示是否出错，第二个值 false 表示没初始化， true 表示已经初始化
    idIsInit: async function (id) {
        if (!config.cache) {
            return this.getIsInitByRequest(id);
        }
        // 如果通过缓存查询到的数据是未初始化，则再通过请求判断是否已经初始化，防止多次初始化

        let cacheRes = await this.getIsInitByCache(id)
        if (cacheRes === false) {
            console.log(id + " 缓存不存在, 从github获取状态...")

            return this.getIsInitByRequest(id);
        }
        return [false, true];
    },

    getOutputCacheFrom() {
        return new Promise((resolve, reject) => {
            let req = https.get(config.cacheRemote, function (res) {
                let chunks = [];

                res.on("data", function (chunk) {
                    chunks.push(chunk);
                });

                res.on("end", function () {
                    return resolve(JSON.parse(Buffer.concat(chunks).toString()));
                });

                res.on("error", function (error) {
                    return reject(error);
                });
            });

            req.end();
        })
    },
    /**
     * 通过缓存判断是否已经初始化
     * @param {string} gitalkId 初始化的id
     * @return {Promise<boolean>} false 表示没初始化， true 表示已经初始化
     */
    getIsInitByCache: async function (gitalkId) {
        if (this.gitalkCache === null) {
            // 判断缓存文件是否存在
            this.gitalkCache = false;
            try {
                this.gitalkCache = JSON.parse(fs.readFileSync(config.cacheFile).toString("utf-8"));

                console.log("读取缓存文件成功 " + config.cacheFile)
            } catch (e) {
                console.log("读取缓存文件失败 " + config.cacheFile + " : " + e.message)

                if (config.cacheRemote) {
                    console.log("正在从 " + config.cacheRemote + " 读取文件")
                    try {
                        this.gitalkCache = await this.getOutputCacheFrom()
                        console.log("读取缓存文件成功 " + config.cacheRemote)
                    } catch (e) {
                        console.log("读取缓存文件失败 " + config.cacheRemote + " : " + e.message)
                    }
                }
            }
        }

        let that = this

        return Promise.resolve(function (gitalkId) {
            if (!that.gitalkCache) {
                return false;
            }
            return !!that.gitalkCache.find(({id: itemId}) => (itemId === gitalkId));
        }(gitalkId));
    },

    /**
     * 写入内容
     * @param {string} fileName 文件名
     * @param {string} content 内容
     * @param flag
     */
    write: async function (fileName, content, flag = 'w+') {
        return new Promise((resolve) => {
            fs.open(fileName, flag, function (err, fd) {
                if (err) {
                    resolve([err, false]);
                    return;
                }
                fs.writeFile(fd, content, function (err) {
                    if (err) {
                        resolve([err, false]);
                        return;
                    }
                    fs.close(fd, (err) => {
                        if (err) {
                            resolve([err, false]);
                        }
                    });
                    resolve([false, true]);
                });
            });
        });
    },

    start: async function (postDir) {
        const urls = await this.readItems(postDir);
        // 报错的数据
        const errorData = [];
        // 已经初始化的数据
        const initializedData = [];
        // 成功初始化数据
        const successData = [];
        for (const item of urls) {
            const {url, title, desc} = item;
            const id = url;
            const [err, res] = await this.idIsInit(id);
            if (err) {
                console.log(`Error: 查询评论异常 [ ${title} ] , 信息：`, err || '无');
                errorData.push({
                    ...item,
                    info: '查询评论异常',
                });
                continue;
            }
            if (res === true) {
                console.log(`--- Gitalk 已经初始化 --- [ ${title} ] `);
                initializedData.push({id});
                continue;
            }
            console.log(`Gitalk 初始化开始... [ ${title} ] `);
            const [e, r] = await this.gitalkInitInvoke({
                id,
                url,
                title,
                desc
            });
            if (e || !r) {
                console.log(`Error: Gitalk 初始化异常 [ ${title} ] , 信息：`, e || '无');
                errorData.push({
                    ...item,
                    info: '初始化异常',
                });
                continue;
            }
            successData.push({
                id,
            });
            console.log(`Gitalk 初始化成功! [ ${title} ] `);
        }

        console.log(''); // 空输出，用于换行
        console.log('--------- 运行结果 ---------');
        console.log(''); // 空输出，用于换行

        if (errorData.length !== 0) {
            console.log(`报错数据： ${errorData.length} 条。`);
            console.log(JSON.stringify(errorData, null, 2))
        }

        console.log(`本次成功： ${successData.length} 条。`);

        // 写入缓存
        if (config.cache) {
            console.log(`写入缓存： ${(initializedData.length + successData.length)} 条，已初始化 ${initializedData.length} 条，本次成功： ${successData.length} 条。参考文件 ${config.cacheFile}。`);
            await this.write(config.cacheFile, JSON.stringify(initializedData.concat(successData), null, 2));
        } else {
            console.log(`已初始化： ${initializedData.length} 条。`);
        }
    },
}

autoGitalkInit.start('source/_posts').then(r => console.log("end"));
