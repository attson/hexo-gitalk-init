const fs = require('fs');
const path = require('path');
const readline = require('readline');
const https = require('https');

let config = {}

if (fs.existsSync(path.join(__dirname, 'gitalk_init.json'))) {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'gitalk_init.json')).toString('utf-8'))

    Object.keys(config).forEach(key => {
        const value = config[key];

        const reg = /{process\.env\.[a-zA-Z_\-}]*/gm

        const match = value.match(reg)
        if (match) {
            match.forEach(match => {
                config[key].replace(match, process.env[match.substring(13, match.length - 1)])
            })
        }
    })
} else {
    // 配置信息
    config = {
        // GitHub repository 所有者，可以是个人或者组织。对应Gitalk配置中的owner
        username: process.env.GITHUB_REPOSITORY_OWNER,

        // 储存评论issue的github仓库名，仅需要仓库名字即可。对应 Gitalk配置中的repo
        repo: process.env.GITALK_INIT_REPO,

        // 从 GitHub 的 Personal access tokens 页面，点击 Generate new token
        token: process.env.GITALK_TOKEN,

        // 是否启用缓存，启用缓存会将已经初始化的数据写入配置的 outputCacheFile 文件，下一次直接通过缓存文件 outputCacheFile 判断
        enableCache: process.env.GITALK_INIT_CACHE || true,
        // 缓存文件输出的位置
        cacheFile: process.env.GITALK_INIT_CACHE_FILE || path.join(__dirname, './public/gitalk-init-cache.json'),

        // 只用于获取缓存的来源，缓存仍然会写到 cacheFile. 读取优先级 cacheFile > cacheRemote. 故cacheFile文件存在时，忽略 cacheRemote
        cacheRemote: process.env.GITALK_INIT_CACHE_REMOTE,
        // 通过远程读取文件，这样就不需要在本地的博客源文件中保存(保存在静态站点的public中)
        // output 到 public 目的就是将文件放在静态站点里面，下一次构建时，可以从远程读取

        postsDir: process.env.GITALK_INIT_POSTS_DIR || 'source/_posts'
    };
}

function configInit(config) {
    if (config.repo === undefined) {
        config.repo = `${config.username}.github.io`
    }

    if (config.cacheRemote === undefined) {
        config.cacheRemote = `https://${config.repo}/gitalk-init-cache.json`
    }

    if (config.postsDir === undefined) {
        config.postsDir = 'source/_posts'
    }

    if (config.cacheFile === undefined) {
        config.cacheFile = path.join(__dirname, './public/gitalk-init-cache.json')
    }

    if (config.enableCache === undefined) {
        config.enableCache = true
    }
}

configInit(config)

const hostname = 'api.github.com'
const apiPath = '/repos/' + config.username + '/' + config.repo + '/issues';

const autoGitalkInit = {
    gitalkCache: null,
    gitalkIdGenerator: null,
    permalink: null,
    getFiles (dir, files_) {
        files_ = files_ || [];
        const files = fs.readdirSync(dir);
        for (let i in files) {
            let name = dir + '/' + files[i];
            if (fs.statSync(name).isDirectory()) {
                this.getFiles(name, files_);
            } else {
                if (name.endsWith('.md')) {
                    files_.push(name);
                }
            }
        }
        return files_;
    },
    async readItem(file) {
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
                if (line.trim() === '---') {
                    break
                } else {
                    const items = line.split(':')
                    if (['title', 'desc', 'date', 'comment'].indexOf(items[0].trim()) !== -1) {
                        post[items[0].trim()] = items[1].trim()
                    }
                }
            } else {
                if (line.trim() === '---') {
                    start = true
                }
            }
        }

        fileStream.close()

        if (Object.keys(post).length === 0) {
            console.log(`gitalk: warn read empty from: ${file}`);

            return null
        }
        if (post['comment'] === false || post['comment'] === 'false') {
            console.log(`gitalk: ignore by comment = ${post['comment']} : ${file}`);
            return null
        }

        if (!('title' in post)) {
            console.log(`gitalk: ignore because the title miss: ${file}`);
            return null
        }

        if (!('date' in post)) {
            console.log(`gitalk: ignore because the date miss: ${file}`);
            return null
        }

        const regex = /^\d{4}-\d{2}-\d{2} \d{2}$/gm;

        if (!(regex.test(post['date']))) {
            console.log(`gitalk: ignore because the date ${post['date']} invalid: ${file}`);
            return false;
        }

        // filename
        const filename = path.basename(file, '.md');

        post['pathname'] = '/' + this.getPathname(post['date'], post['title'], filename)
        post['desc'] = post['title']

        return post
    },

    getPermalink() {
        let content = fs.readFileSync(path.join(__dirname, '_config.yml')).toString("utf-8")
        let split = content.split("\n");
        for (let i = 0; i < split.length; i++) {
            if (split[i].startsWith("permalink: ")) {
                return split[i].split("#")[0].substring(11)
            }
        }

        return null
    },

    getPathname(date, title, file) {
        const year = date.substring(0, 4)
        const mm = date.substring(5, 7)
        const dd = date.substring(8, 10)
        const hh = date.substring(11, 13)

        const permalinkRegex = /(:[a-zA-Z]+)/gm

        let permalink = this.permalink

        permalink.match(permalinkRegex).forEach(item => {
            switch (item) {
                case ":post_title": {
                    permalink = permalink.replace(item, title)
                    break;
                }
                case ":year": {
                    permalink = permalink.replace(item, year)
                    break;
                }
                case ":month": {
                    permalink = permalink.replace(item, mm)
                    break;
                }
                case ":day": {
                    permalink = permalink.replace(item, dd)
                    break;
                }
                case ":hour": {
                    permalink = permalink.replace(item, hh)
                    break;
                }
                case ":title": {
                    permalink = permalink.replace(item, file)
                    break;
                }
            }
        })

        return permalink
    },

    async readPosts(dir) {
        const posts = [];
        for (let file of this.getFiles(dir)) {
            const post = await this.readItem(file);
            if (post != null) {
                posts.push(post)
            }
        }

        return posts
    },

    // 调用github接口初始化
    gitalkInitInvoke({pathname, id, title, desc}) {
        const options = {
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

        const link = `https://${config.repo}${pathname}`

        //创建issue
        const reqBody = {
            'title': title,
            'labels': ['Gitalk', id],
            'body': `[${link}](${link})\r\n\r\n${desc}`
        };

        return new Promise(resolve => {
            let req = https.request(options, function (res) {
                const chunks = [];

                res.on('data', function (chunk) {
                    chunks.push(chunk);
                });

                res.on('end', function () {
                    let info = JSON.parse(Buffer.concat(chunks).toString())

                    if (res.statusCode !== 201) {
                        return resolve([info.message, false]);
                    }

                    return resolve([false, true]);
                });

                res.on('error', function (error) {
                    return resolve([error.message, false]);
                });
            });

            req.write(JSON.stringify(reqBody))

            req.end();
        })
    },

    /**
     * 通过github api 请求判断是否已经初始化
     * @param {string} id gitalk 初始化的id
     * @return {Promise<[boolean, boolean]>} 第一个值表示是否出错，第二个值 false 表示没初始化， true 表示已经初始化
     */
    getIsInitByGitHub (id) {
        const options = {
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
            const req = https.request(options, function (res) {
                const chunks = [];

                res.on('data', function (chunk) {
                    chunks.push(chunk);
                });

                res.on('end', function () {
                    const res = JSON.parse(Buffer.concat(chunks).toString());
                    if (res.length > 0) {
                        return resolve([false, true]);
                    } else {
                        return resolve([false, false]);
                    }
                });

                res.on('error', function (error) {
                    return resolve([error, false]);
                });
            });

            req.end();
        })
    },

    // 根据缓存，判断链接是否已经初始化
    // 第一个值表示是否出错，第二个值 false 表示没初始化， true 表示已经初始化
    async idIsInit (id) {
        if (!config.enableCache) {
            return this.getIsInitByGitHub(id);
        }
        // 如果通过缓存查询到的数据是未初始化，则再通过请求判断是否已经初始化，防止多次初始化

        const cacheRes = await this.getIsInitByCache(id)
        if (cacheRes === false) {
            console.log(id + ' 缓存不存在, 从github获取状态...')

            return this.getIsInitByGitHub(id);
        }
        return [false, true];
    },

    /**
     * 通过远程地址获取缓存内容
     * @returns {Promise<Object>}
     */
    getRemoteCache() {
        return new Promise((resolve, reject) => {
            const req = https.get(config.cacheRemote, function (res) {
                const chunks = [];

                res.on('data', function (chunk) {
                    chunks.push(chunk);
                });

                res.on('end', function () {
                    return resolve(JSON.parse(Buffer.concat(chunks).toString()));
                });

                res.on('error', function (error) {
                    return reject(error);
                });
            });

            req.end();
        })
    },
    /**
     * 通过缓存判断是否已经初始化, 优先加载缓存文件，文件不存在则尝试从 cacheRemote 获取
     * @param {string} gitalkId 初始化的id
     * @return {Promise<boolean>} false 表示没初始化， true 表示已经初始化
     */
    async getIsInitByCache(gitalkId){
        if (this.gitalkCache === null) {
            // 判断缓存文件是否存在
            this.gitalkCache = false;
            try {
                this.gitalkCache = JSON.parse(fs.readFileSync(config.cacheFile).toString('utf-8'));

                console.log('读取缓存文件成功 ' + config.cacheFile)
            } catch (e) {
                console.log('读取缓存文件失败 ' + config.cacheFile + ' : ' + e.message)

                if (config.cacheRemote) {
                    console.log('正在从 ' + config.cacheRemote + ' 读取文件')
                    try {
                        this.gitalkCache = await this.getRemoteCache()
                        console.log('读取缓存文件成功 ' + config.cacheRemote)
                    } catch (e) {
                        console.log('读取缓存文件失败 ' + config.cacheRemote + ' : ' + e.message)
                    }
                }
            }
        }

        const that = this

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
    async write(fileName, content, flag = 'w+') {
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
    // 生成 GitalkId
    getGitalkId(pathname, title, desc, date) {
        if (this.gitalkIdGenerator == null) {
            if (fs.existsSync("get-gitalk-id.js")) {
                this.gitalkIdGenerator = require(path.join(__dirname, "get-gitalk-id.js")).getGitalkId
            } else {
                this.gitalkIdGenerator = function (pathname) {
                    let id = pathname

                    // github issue label max 50
                    if (id.length > 50) {
                        id = id.substring(0, 50 - 3) + '...'
                    }

                    return id
                }
            }
        }

        return this.gitalkIdGenerator(pathname, title, desc, date)
    },
    async start(postDir) {
        this.permalink = this.getPermalink()
        if (!this.permalink) {
            console.log(`gitalk: get permalink fail. stopped`);
            return
        }
        const posts = await this.readPosts(postDir);
        // 报错的数据
        const errorData = [];
        // 已经初始化的数据
        const initializedData = [];
        // 成功初始化数据
        const successData = [];
        for (const item of posts) {
            const {pathname, title, desc, date} = item;
            const id = this.getGitalkId(pathname, title, desc, date);
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
                pathname,
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
        if (config.enableCache) {
            console.log(`写入缓存： ${(initializedData.length + successData.length)} 条，已初始化 ${initializedData.length} 条，本次成功： ${successData.length} 条。参考文件 ${config.cacheFile}。`);
            await this.write(config.cacheFile, JSON.stringify(initializedData.concat(successData), null, 2));
        } else {
            console.log(`已初始化： ${initializedData.length} 条。`);
        }
    },
}

autoGitalkInit.start(config.postsDir).then(() => console.log('end'));
