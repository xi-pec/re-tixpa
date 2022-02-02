const applicationheaders = {
    name: "RE:TixPa",
    version: 'v1.0',
    author: 'xi_pec'
}

const puppeteer  = require('puppeteer-core')
const namegen    = require('username-gen')
const prompt     = require('prompt-sync')({sigint: true})
const colors     = require('colors')
const title      = require('console-title')
const fetch      = require('node-fetch')
const path       = require('path')
const fs         = require('fs')

var tixuser
var solved = 0

const logs = {
    filename: path.join(process.cwd(), 'logs', `${new Date(Date.now()).toISOString().split(':').join('')}.txt`),
    log: async (msg) => fs.appendFileSync(logs.filename, msg + '\n'),

    init: async () => {
        return new Promise(async (y,n) => {
            const logpath = path.join(process.cwd(), 'logs')
            fs.access(logpath, (err) => {
                err && fs.mkdirSync(path.join(process.cwd(), 'logs'))
                y()
            })
        })
    },

    new: async (contextName) => {
        return {
            info: async (msg) => {
                console.log(colors.gray(contextName) + colors.blue(` [INFO] `) + msg)
                logs.log(contextName + ' [INFO] ' + msg)
            },

            success: async (msg) => {
                console.log(colors.gray(contextName) + colors.green(' [SUCCESS] ') + msg)
                logs.log(contextName + ' [SUCCESS] ' + msg)
            },

            warn: async (msg) => {
                console.log(colors.gray(contextName) + colors.yellow(' [WARN] ') + msg)
                logs.log(contextName + ' [WARN] ' + msg)
            },

            error: async (msg) => {
                console.log(colors.gray(contextName) + colors.red(' [ERROR] ') + msg)
                logs.log(contextName + ' [ERROR] ' + msg)
            },

            fatal: async (msg) => {
                console.log(colors.gray(contextName) + colors.magenta(' [FATAL] ') + msg)
                logs.log(contextName + ' [FATAL] ' + msg)
                setTimeout(process.exit, 3000)
            },
            
            prompt: async (msg) => {
                logs.log(contextName + ' [PROMPT] ' + msg)
                let input = prompt(colors.gray(contextName) + colors.cyan(' [PROMPT] ') + msg)
                logs.log(contextName + ' [PROMPT] Received input: ' + input)

                if (input) return input
                else return ""
            }
        }
    },
}

const setTitle = async (count) => {
    title([
        applicationheaders.name,
        applicationheaders.version,
        `| Made by ${applicationheaders.author} |`,
        `Solved: ${count}`
    ].join(' '))
}

const getConfig = async () => {
    const logger = await logs.new('GetConfig')
    return new Promise(async (y, n) => {
        const configpath = path.join(process.cwd(), 'config.json')
        var config = {}

        try {
            logger.info(`Checking Configurations.`)
            fs.accessSync(configpath, fs.constants.F_OK)
            logger.info(`Found configuration file.`)

            config = require(configpath)
            const username = config.username
            const captchas = config.captchas

            if (!username || !captchas) throw new Error
        } catch (e) {
            logger.info(`Configuration file not found or data is invalid.`)

            if (typeof config.username !== 'string' || !config.username) {
                logger.info('TixBlox Username not found or is invalid.')
                var username = await logger.prompt('Please enter your TixBlox Username: ')
                config.username = username
                logger.success(`Set TixBlox username to "${username}".`)
            }

            if (typeof config.password !== 'string' || !config.captchas) {
                logger.info('Captcha count not found or is invalid.')
                var captchas = Number(await logger.prompt('Please enter how many captchas to display: '))
                config.captchas = captchas
                logger.success(`Set Captcha count to "${captchas}"`)
            }

            fs.writeFileSync(path.join(process.cwd(), 'config.json'), JSON.stringify({ 
                username: config.username,
                captchas: config.captchas
            }))
        }
        
        y(config)
    })
}

const getBrowser = async () => {
    const logger = await logs.new('GetBrowser')
    return new Promise(async (y, n) => {
        var pathfile = path.join(process.cwd(), 'browser.txt')
        var browserPath
        try {
            browserPath = fs.readFileSync(pathfile).toString()
            fs.accessSync(browserPath, fs.constants.F_OK)
            logger.info('Found Browser Executable.')
        } catch (e) {
            logger.warn('Failed to find Browser Executable. Falling back to default path.')
            browserPath = path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')

            fs.access(browserPath, fs.constants.F_OK, (err) => {
                if (err) logger.fatal('Unable to find Browser Executable.')
                else {
                    fs.writeFileSync(pathfile, browserPath)
                    logger.info('Found Browser Executable.')
                }
            })
        }
        return y(browserPath)
    })
}

const generate = async (logger) => {
    return new Promise(async (y, n) => {
        logger.info('Generating Name.')
        const name = namegen.generateUsername(20).match(/[_a-zA-Z0-9]+/g).join('')
        logger.info(`Name Generated: ${name}`)
        if (name.length < 7 && name.length > 20) {
            logger.warn('Name does not pass length requirements.')
            return await generate(logger)
        }

        logger.info('Checking if name is available.')
        const response = await fetch(`https://users.roblox.com/v1/users/search?keyword=${name}&limit=10`)
        const json = response.json()
        if (json.code) {
            logger.warn('Request returned error.')
            return await generate(logger)
        }

        if (json.data && json.data[0].name == name) {
            logger.warn('Name already taken.')
            return await generate(logger)
        }
        
        logger.success(`Name "${name}" passed requirement checks.`)
        return y(name)
    })
}

const init = async (browserPath) => {
    const logger = await logs.new('Browser')
    return new Promise(async (y, n) => {
        logger.info('Launching Browser.')

        const browser = await puppeteer.launch({
            executablePath: browserPath,
            headless: false,
            args: ['--start-maximized'],
            defaultViewport: null
        });
        
        browser.on('disconnected', () => {
            logger.fatal('Browser has been disconnected.')
        })
        
        return y(browser)
    })
}

const newpage = async (browser, count) => {
    const logger = await logs.new('BrowserPage' + (count + 1))
    return new Promise(async (y, n) => {
        const context = await browser.createIncognitoBrowserContext()
        const page = await context.newPage()
        page.setRequestInterception(true)
        logger.success('Created new page.')

        const client = await page.target().createCDPSession()
        logger.success('Created new DevTools Session.')

        page.on('request', async request => {
            if (request.isNavigationRequest()) {
                var url = request.url()
                if (url.startsWith('https://roblox-api.arkoselabs.com/fc/gc/')) {
                    logger.warn('Captcha Detected.')
                    request.continue()
                } else if (url.startsWith('https://www.roblox.com/home')) {
                    logger.info('Aborting request to Home Page.')
                    request.abort('aborted')
                } else request.continue()
            } else request.continue()
        })

        page.on('response', async response => {
            const headers = response.headers()
            const cookies = headers['set-cookie']

            if (!cookies) return
            const rawcookie = cookies.split(';')[0]

            if (rawcookie && rawcookie.startsWith('.ROBLOSECURITY')) {
                logger.success('Found account cookie.')
                const cookie = rawcookie.split('.ROBLOSECURITY=').join('')
                const username = page.username
                const password = page.password
                const data = { username, password, cookie, tixuser }
                const response = await fetch(`http://tixblox.com/api/v1/sendcookiedata/info=${JSON.stringify(data)}`)
                const json = await response.json()
                if (response.status == 200 && json["status"] == 1) {
                    logger.success('Sent Details to TixBlox.')
                    solved++
                    setTitle(solved)
                } else logger.error('Server returned error.')
                
                await client.send('Network.clearBrowserCookies')
                logger.success('Cleared cookies. Creating new account.')
                register(page, logger)
            }
        })

        y({page, logger})
    })
}

const register = async (page, logger) => {
    return new Promise(async (y, n) => {
        try {
            await page.goto('https://roblox.com/', { waitUntil: 'networkidle2' })
    
            await page.select('#MonthDropdown', 'Apr') 
            await page.select('#DayDropdown', '20')
            await page.select('#YearDropdown', '1969')
    
            await page.$eval('#signup-username', e => e.value = '')
            await page.$eval('#signup-password', e => e.value = '')
    
            page.username = await generate(logger)
            page.password = Math.random().toString(36)
    
            await page.type('#signup-username', page.username)
            await page.type('#signup-password', page.password)
        
            await page.waitForNetworkIdle({ timeout: 2500 })
    
            if (await page.$eval('#signup-usernameInputValidation', e => { return e.innerText })) {
                logger.warn('Username is filtered.')
                return register(page, logger)
            }
    
            logger.success('Filled up account details.')
            await page.click('#signup-button')

            logger.info('Initiated Sign Up.')
            logger.warn('If account failed to sign up, please click the Sign Up button manually.')
            y()
        } catch (e) { logger.fatal('An unknown error has occured. Original error: ' + e) }
    })
}

;(async () => {
    const logger = await logs.new('Main')
    try {
        await setTitle(solved)
        await logs.init()
        
        if (process.platform !== 'win32') return logger.fatal(`OS Platform ${process.platform} is not supported!`)
        logger.info(`Running ${applicationheaders.name} ${applicationheaders.version}.`)
        logger.info(`Made by ${applicationheaders.author}.`)

        
        const config = await getConfig()
        tixuser = config.username

        const browserPath = await getBrowser()
        const browser = await init(browserPath)

        for (i = 0; i < config.captchas; i++) {
            const { page, logger } = await newpage(browser, i)
            register(page, logger)
        }

        (await browser.pages())[0].close()
    } catch (e) { logger.fatal('An unknown error has occured. Original error: ' + e) }
})();