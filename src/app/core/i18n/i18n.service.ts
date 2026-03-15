import { Injectable, signal, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const messages = {
    zh_CN: {
        theme: { dark: "深色", light: "浅色" },
        status: { uplink: "网关连接正常", bots: "机器人", signals: "活跃账号" },
        nav: { home: "首页", matches: "个人战绩", ladder: "天梯排行", team: "战队预约", report: "玩家举报", reportList: "公示信息", ban: "封号名单", download: "下载中心", platformUpdates: "平台更新", mapUpdates: "地图更新", faq: "常见问题", support: "联系客服", onlineSupport: "在线咨询" },
        reportList: {
            title: "公示信息",
            subtitle: "记录平台所有玩家提交的举报信息及处理进度。",
            table: {
                player: "被举报人",
                reason: "举报原因",
                date: "举报时间",
                status: "处理状态",
                reporter: "举报人"
            },
            noResults: "暂无举报记录"
        },
        auth: { login: "登录", register: "注册", logout: "退出登录" },
        hero: { mainTitle: "无兄弟 不Dota", subTitle: "叫上你的队友 再次集结征战远古遗迹", cta: "下载 CC对战平台" },
        reg: { 
            title: "账号注册", 
            user: "用户名", 
            email: "电子邮箱", 
            pass: "密码", 
            confirm: "确认密码", 
            submit: "立即注册", 
            back: "已有账号？返回登录", 
            verified: "验证成功", 
            verifyComplete: "验证通过", 
            slideToVerify: "向右滑动完成拼图", 
            tryAgain: "请重试", 
            networkError: "网络请求失败，请检查后端服务是否正常运行。", 
            cryptoError: "加密计算失败，请更换现代浏览器重试。", 
            regSuccess: "注册成功！即将跳转到登录页...", 
            regFail: "注册失败", 
            expired: "验证已过期，请重新验证", 
            rating_godlike: "非常完美！", 
            rating_perfect: "还不错！", 
            rating_pass: "一般般", 
            emailHint: "请输入真实邮箱用于激活账号",
            emailError: "请输入有效的电子邮箱地址",
            phone: "手机号码",
            phoneHint: "用于安全验证及找回密码",
            phoneError: "请输入有效的手机号码",
            userHint: "3-14位字符，支持字母、数字及符号 (.-_[]())",
            userError: "用户名格式错误（不能为纯数字）",
            passHint: "至少8位，需包含大小写字母和数字",
            passError: "密码强度不足，请按要求输入",
            confirmHint: "请再次输入密码以确认",
            confirmError: "两次输入的密码不一致",
            required: "此项不能为空",
            userLength: "用户名长度需在3-14位之间"
        },
        login: { 
            title: "CC对战平台", 
            user: "账号 / 邮箱", 
            pass: "密码", 
            remember: "记住密码", 
            register: "注册账号", 
            submit: "登 录", 
            enterGame: "进入游戏",
            userHint: "请输入您的账号或电子邮箱",
            userError: "请输入有效的账号或邮箱",
            passHint: "请输入您的登录密码",
            passError: "密码不能为空",
            webAuthFail: "网页端登录失败，请检查账号密码",
            bnetAuthFail: "战网端验证失败，请重试"
        },
        matches: { title: "个人战绩", recent: "最近比赛", overview: "数据概览", winRate: "胜率", kda: "KDA", totalGames: "总场次", hero: "英雄", result: "结果", kda_full: "K / D / A", items: "物品", mode: "模式", duration: "时长", date: "日期", pts: "积分", win: "胜利", lose: "失败" },
        squad: { title: "战队预约", lobby: "预约大厅", myTeam: "我的战队", create: "发布预约", teamName: "战队名称", avgRank: "平均等级", mode: "模式", status: "状态", action: "操作", waiting: "等待中", battling: "战斗中", challenge: "挑战", spectate: "观战", loadMore: "加载更多", all: "全部", server: "服务器", region: "地区", vs: "VS", regions: { cn: "中国", eu: "欧洲", na: "北美", sea: "东南亚", cis: "独联体" }, captain: "队长", noLobby: "暂无战队等待挑战" },
        mySquad: { createdAt: "创建于:", score: "战队分数", rank: "排名", winRate: "胜率", totalGames: "总场次", members: "战队成员", captain: "队长", member: "队员", noMembers: "暂无成员", recentMatches: "最近战绩", date: "日期", opponent: "对手", result: "结果", mode: "模式", duration: "时长", noMatches: "暂无比赛记录", win: "胜利", lose: "失败" },
        report: { title: "玩家举报", submitTitle: "提交举报", target: "违规玩家ID", reason: "举报理由", desc: "详细描述", matchId: "比赛ID (选填)", replay: "上传录像 (.w3g)", replayError: "录像文件过大 (最大 10MB)", replayHint: "支持 .w3g 格式，最大 10MB", submit: "提交举报", history: "举报记录", date: "日期", status: "处理状态", pending: "待处理", processed: "已封禁", rejected: "已驳回", types: { mh: "全图外挂 (MapHack)", feed: "故意送人头", afk: "挂机 / 消极比赛", abuse: "言语辱骂", other: "其他行为" } },
        download: { title: "下载中心", subtitle: "获取最新版 CC 对战平台客户端，开启您的电竞之旅。", client: "官方客户端", version: "版本", size: "大小", date: "更新日期", downloadBtn: "立即下载", requirements: "系统需求", os: "操作系统", cpu: "处理器", ram: "内存", storage: "硬盘空间", drivers: "显卡驱动", manual: "手动更新包", warcraft: "魔兽争霸 III (1.26)", maps: "Dota 地图包", tools: "辅助工具" },
        footer: { 
            aboutTitle: "平台概况", 
            aboutText: "专注于魔兽争霸III (v1.26) 经典 Dota 1 竞技体验。承载热血，延续传奇。", 
            seasonStart: "赛季开始时间",
            seasonStartVal: "2026/3/1 00:00:00",
            seasonEnd: "赛季结束时间",
            seasonEndVal: "2026/6/1 00:00:00",
            status: "当前状态",
            statusVal: "进行中",
            soloRank: "个人排行", 
            teamRank: "战队排行", 
            banList: "封号名单查询", 
            support: "联系客服", 
            solo: "个人排行", 
            team: "战队排行", 
            ban: "封号名单查询" 
        },
        contact: {
            title: "联系客服",
            subtitle: "如果您在平台使用过程中遇到任何问题，请通过以下方式联系我们。",
            qqGroup: "官方 QQ 群",
            qqGroupDesc: "加入群聊获取实时技术支持与玩家交流。",
            email: "官方邮箱",
            emailDesc: "商务合作或申诉请发送邮件至此地址。",
            discord: "Discord 社区",
            discordDesc: "面向海外玩家的交流与反馈平台。",
            workTime: "服务时间",
            workTimeVal: "周一至周日 09:00 - 22:00",
            faq: "常见问题",
            faq1: "如何找回密码？",
            ans1: "请在登录页面点击“忘记密码”，通过绑定的邮箱进行找回。",
            faq2: "游戏运行卡顿怎么办？",
            ans2: "请尝试关闭其他高占用程序，或在设置中调低游戏画质。",
            faq3: "账号被封禁了如何申诉？",
            ans3: "请发送邮件至官方邮箱，说明情况并提供相关证据。"
        },
        forgot: {
            title: "找回密码",
            subtitle: "请输入您注册时使用的电子邮箱，我们将向您发送重置链接。",
            email: "电子邮箱",
            emailHint: "请输入您的注册邮箱",
            emailError: "请输入有效的电子邮箱地址",
            submit: "发送重置链接",
            back: "返回登录",
            success: "重置链接已发送至您的邮箱，请查收。",
            fail: "发送失败，请检查邮箱是否正确或稍后重试。"
        },
        faqPage: {
            title: "常见问题 (FAQ)",
            subtitle: "为您解答在 CC 对战平台使用过程中的基础操作与常见疑问。",
            q0: "如何在 CC对战平台 开始游戏？",
            a0: "要在 CC对战平台 开始游戏，您只需要魔兽争霸 III、CC对战平台启动器和 CC对战平台账号。\n\n准备开始：\n您的魔兽争霸 III：冰封王座必须是 v1.26a 版本。\n\n1. 魔兽争霸 III：<a href='/download#warcraft' class='text-accent hover:underline'>前往下载冰封王座 1.26a</a>\n2. 创建您的 CC对战平台 账号：<a href='/register' class='text-accent hover:underline'>前往注册页面</a>\n3. 下载并安装 CC对战平台 启动器：<a href='/download#client' class='text-accent hover:underline'>前往下载CC对战平台</a>\n\n连接到服务器：\n现在您已准备好加入战斗。以下是连接到服务器并玩 DotA 或许多自定义地图的最后步骤：\n— 打开启动器并设置魔兽争霸 III exe 的路径，然后点击“开始魔兽争霸 III”\n— 从 Battle.net 网关中选择 CC Battle Platform\n— 使用您在网站上创建的账号登录并开始游戏。",
            q1: "如何注册账号？",
            a1: "a. 桌面客户端注册：打开客户端点击“注册账号”按钮。\nb. 网页注册：访问官网注册页面进行注册。",
            q2: "如何创建游戏？",
            a2: "a. 桌面客户端创建：在游戏大厅点击“创建游戏” 或 聊天窗口输入命令，如：/host xl83tb GoodGame 。\nb. 进入魔兽争霸战网（不是局域网）：点击聊天或进入频道，在聊天窗口输入命令，如：/host xl83tb GoodGame",
            q3: "如何开始游戏？",
            a3: "a. 桌面客户端：当人满时直接点击“开始游戏”或输入命令 /start。\nb. 魔兽争霸客户端：当人满时在聊天框输入 /start 命令即可开始。",
            q4: "如何查看与设置延迟？",
            a4: "查看延迟：输入 /ping 命令。\n设置延迟：输入 /lat [数值] 命令，例如：/lat 25 (推荐值 20-50)。",
            q5: "发现队友挂机、送人头或恶意游戏怎么办？",
            a5: "输入命令 /votekick [玩家序号] 发起踢人投票。例如：/votekick 5。注意：只能踢出本方队友，需全队同意方可生效。",
            q6: "如何快速结束游戏？",
            a6: "输入命令 -ff 投票结束游戏。当本方有 4 名玩家投票时，游戏将自动结束。",
            more: "查看更多问题",
            noMore: "已显示所有常见问题。仍有疑问？",
            q7: "如何找回密码？",
            a7: "请在登录页面点击“忘记密码”，通过绑定的邮箱进行找回。",
            q8: "游戏运行卡顿怎么办？",
            a8: "请尝试关闭其他高占用程序，或在设置中调低游戏画质。",
            q9: "账号被封禁了如何申诉？",
            a9: "请发送邮件至官方邮箱，说明情况并提供相关证据。",
            q10: "如何加入官方玩家社区？",
            a10: "您可以加入我们的官方 QQ 群：123456789，或者访问我们的 Discord 频道进行交流。"
        },
        home: {
            featuresTitle: "平台特色功能",
            match: { title: "智能匹配机制", desc: "基于 ELO 算法的深度优化，确保每场对局实力均衡，告别虐菜与被虐。" },
            anticheat: { title: "反外挂系统", desc: "自研内核级驱动防护，实时检测全图、内存修改等违规行为，维护公平竞技环境。" },
            squad: { title: "战队预约系统", desc: "便捷的战队预约大厅，支持自定义规则与多图模式，让团队竞技更有仪式感。" },
            report: { title: "全方位举报系统", desc: "人工+AI双重审核机制，快速响应违规举报，让消极比赛无处遁形。" }
        },
        ladder: { title: "天梯排行", solo: "个人排行", team: "战队排行", rank: "排名", player: "玩家", teamName: "战队", points: "积分", winRate: "胜率", games: "场次", trend: "趋势", signature: "擅长英雄", level: "等级", loadMore: "加载更多", region: "地区", status: "状态", online: "在线", offline: "离线", ingame: "游戏中" },
        mapUpdates: {
            title: "地图更新",
            subtitle: "追踪 Dota 1 经典地图的最新动态，对比版本差异，一键同步更新。",
            popularMaps: "当前流行地图",
            comparison: "版本对比",
            update: "同步更新",
            updating: "正在更新...",
            updateSuccess: "地图已更新",
            updateDesc: "当前检测到 3 个地图包可更新，包含最新的平衡性补丁。",
            heroComparison: "英雄差异对比",
            heroSelect: "选择英雄",
            aiModel: "AI 模型",
            aiDisclaimer: "数据由 AI 实时生成，仅供参考。",
            diff: {
                v683d: "经典 6.83d",
                v688v: "平衡 6.88v",
                v688x: "极速 6.88x",
                stability: "稳定性",
                balance: "平衡性",
                features: "新特性",
                popularity: "流行度"
            },
            features: {
                v683d: "经典竞技版本，平衡性极佳。",
                v688v: "平衡性优化版本，竞技体验升级。",
                v688x: "极速竞技版本，包含最新英雄与平衡性调整。"
            },
            prompt: `你是一个 Dota 1 专家。请分析英雄 "{hero}" 在三个地图版本 (6.83d, 6.88v, 6.88x) 中的差异。
      请严格按照以下 JSON 格式返回数据，不要包含任何 Markdown 代码块标记或额外文字：
      {
        "id": "hero_id",
        "name": "{hero}",
        "stats": {
          "6.83d": { "strGrowth": "+2.0", "agiGrowth": "+2.9", "intGrowth": "+2.0", "moveSpeed": "305", "castPoint": "0.67", "skillChanges": "简短描述技能特点" },
          "6.88v": { "strGrowth": "+2.3", "agiGrowth": "+2.9", "intGrowth": "+2.0", "moveSpeed": "310", "castPoint": "0.55", "skillChanges": "简短描述平衡性调整" },
          "6.88x": { "strGrowth": "+2.5", "agiGrowth": "+3.3", "intGrowth": "+2.2", "moveSpeed": "315", "castPoint": "0.4", "skillChanges": "简短描述 6.88x 版本改动" }
        }
      }
      注意：数值必须尽可能准确反映 Dota 1 的真实历史数据。`,
            versions: {
                v683d: {
                    name: "经典竞技版 6.83d",
                    description: "经典版本，竞技性强。"
                },
                v688v: {
                    name: "平衡稳定版 6.88v",
                    description: "平衡性微调，修复 Bug。"
                },
                v688x: {
                    name: "极速竞技版 6.88x",
                    description: "极速竞技推荐版本。在 6.88 基础上进行了大量优化，修复了魔兽引擎限制导致的诸多 Bug，是目前最流行的竞技地图之一。"
                }
            },
            loading: "AI 分析中...",
            retry: "重试",
            table: {
                attributes: "属性 / 技能",
                growth: "力量 / 敏捷 / 智力成长",
                moveSpeed: "移动速度",
                castPoint: "施法前摇",
                coreChanges: "核心改动",
                features: "特性",
                engineFixes: "引擎优化",
                bountyRunes: "赏金神符"
            },
            deepAnalysis: "版本深度解析: ",
            noHeroFound: "未找到匹配的英雄"
        },
        platformUpdates: {
            title: "平台更新",
            subtitle: "查看平台最新的功能更新与修复内容。",
            noUpdates: "暂无更新记录"
        },
        banList: {
            title: "封号名单查询",
            filterHint: "仅列出封禁时长三个月（90天）及以上的名单",
            searchPlaceholder: "输入玩家 ID 查询...",
            table: {
                player: "被封玩家",
                reason: "封号原因",
                date: "封号时间",
                duration: "封号时长",
                reporter: "举报人",
                status: "当前状态"
            },
            durations: {
                permanent: "永久封禁",
                days: "{n} 天"
            },
            status: {
                active: "封印中",
                expired: "已解封"
            },
            noResults: "未找到相关封号记录"
        },
        aiError: {
            notConfigured: "API 密钥未配置，请检查环境变量设置。",
            insufficientBalance: "调用失败：您的 DeepSeek API 账户余额不足，请前往 DeepSeek 开放平台充值后再试。",
            quotaExhausted: "调用失败：当前 API 配额已耗尽，请稍后再试或检查您的账单设置。",
            networkError: "网络连接失败，无法访问后端接口，请检查网络。",
            unknown: "调用失败: ",
            default: "抱歉，AI 助手暂时无法响应。",
            generateFail: "生成失败，请稍后重试。"
        },
        chat: {
            title: "在线客服",
            subtitle: "全天候为您解答平台使用、游戏机制等问题。",
            aiMode: "AI 助手",
            humanMode: "人工客服",
            online: "在线",
            inputPlaceholder: "输入您的问题...",
            send: "发送",
            welcome: "您好！我是 CC 对战平台在线助手，请问有什么可以帮您？",
            humanWelcome: "收到您的反馈，人工客服专员正在处理中，请稍候。通常我们会在 5-10 分钟内回复。",
            systemInstruction: "你是一个 Dota 1 竞技平台（CC对战平台）的在线客服助手。你需要以专业、热情、简洁的方式回答玩家关于平台使用、地图版本、英雄数据、举报流程等方面的问题。如果玩家问到你不确定的技术细节，请引导他们联系人工客服或查看 FAQ。",
            deepseekError: "抱歉，DeepSeek 返回的数据格式异常。",
            geminiError: "抱歉，我暂时无法回答这个问题。"
        }
    },
    en: {
        theme: { dark: "Dark", light: "Light" },
        status: { uplink: "Uplink Normal", bots: "Bots", signals: "Active Accounts" },
        nav: { home: "HOME", matches: "PERSONAL STATS", ladder: "LADDER", team: "SQUAD", report: "REPORT", reportList: "PUBLIC NOTICES", ban: "BAN LIST", download: "DOWNLOAD", platformUpdates: "PLATFORM UPDATES", mapUpdates: "MAP UPDATES", faq: "FAQ", support: "SUPPORT", onlineSupport: "Online Support" },
        reportList: {
            title: "Public Notices",
            subtitle: "Records of all player reports and their processing status.",
            table: {
                player: "Target Player",
                reason: "Reason",
                date: "Report Date",
                status: "Status",
                reporter: "Reporter"
            },
            noResults: "No report records found."
        },
        auth: { login: "LOGIN", register: "JOIN", logout: "LOGOUT" },
        hero: { mainTitle: "NO BROTHERS NO DOTA", subTitle: "GATHER YOUR SQUAD AND BATTLE FOR THE ANCIENTS", cta: "GET CLIENT" },
        reg: { 
            title: "REGISTER", 
            user: "Username", 
            email: "Email", 
            pass: "Password", 
            confirm: "Confirm Password", 
            submit: "REGISTER NOW", 
            back: "BACK TO LOGIN", 
            verified: "SUCCESS", 
            verifyComplete: "Verified", 
            slideToVerify: "Slide right to complete puzzle", 
            tryAgain: "TRY AGAIN", 
            networkError: "Network request failed. Please check if the backend service is running.", 
            cryptoError: "Encryption calculation failed. Please try again with a modern browser.", 
            regSuccess: "Registration successful! Redirecting to login page...", 
            regFail: "Registration failed", 
            expired: "Verification expired, please verify again", 
            rating_godlike: "Flawless!", 
            rating_perfect: "Not Bad!", 
            rating_pass: "Just So-so", 
            emailHint: "Please enter a real email for activation",
            emailError: "Please enter a valid email address",
            phone: "Phone Number",
            phoneHint: "Used for security and recovery",
            phoneError: "Please enter a valid phone number",
            userHint: "3-14 chars, letters, numbers, symbols (.-_[]())",
            userError: "Invalid format (cannot be only digits)",
            passHint: "At least 8 chars, incl. upper/lower/numbers",
            passError: "Password too weak, please follow requirements",
            confirmHint: "Please re-enter password to confirm",
            confirmError: "Passwords do not match",
            required: "This field is required",
            userLength: "Username must be 3-14 characters"
        },
        login: { 
            title: "CC Battle Platform", 
            user: "Username / Email", 
            pass: "Password", 
            remember: "Remember me", 
            register: "Register", 
            submit: "LOGIN", 
            enterGame: "ENTER GAME",
            userHint: "Please enter your username or email",
            userError: "Please enter a valid username or email",
            passHint: "Please enter your password",
            passError: "Password cannot be empty",
            webAuthFail: "Web authentication failed, please check your credentials",
            bnetAuthFail: "Battle.net verification failed, please try again"
        },
        matches: { title: "Personal Stats", recent: "Recent Matches", overview: "Overview", winRate: "Win Rate", kda: "KDA", totalGames: "Total Games", hero: "Hero", result: "Result", kda_full: "K / D / A", items: "Items", mode: "Mode", duration: "Duration", date: "Date", pts: "PTS", win: "WIN", lose: "LOSE" },
        squad: { title: "Squad Battle", lobby: "Battle Lobby", myTeam: "My Squad", create: "Create Lobby", teamName: "Team Name", avgRank: "Avg Level", mode: "Mode", status: "Status", action: "Action", waiting: "Waiting", battling: "Battling", challenge: "Challenge", spectate: "Spectate", loadMore: "Load More", all: "ALL", server: "Server", region: "Region", vs: "VS", regions: { cn: "China", eu: "Europe", na: "NA", sea: "SEA", cis: "CIS" }, captain: "Captain", noLobby: "No lobbies waiting for challenge" },
        mySquad: { createdAt: "Created At:", score: "Team Score", rank: "Rank", winRate: "Win Rate", totalGames: "Total Games", members: "Squad Members", captain: "Captain", member: "Member", noMembers: "No members yet", recentMatches: "Recent Matches", date: "Date", opponent: "Opponent", result: "Result", mode: "Mode", duration: "Duration", noMatches: "No match history", win: "WIN", lose: "LOSE" },
        report: { title: "Report Player", submitTitle: "Submit Report", target: "Target Username", reason: "Reason", desc: "Description", matchId: "Match ID (Optional)", replay: "Upload Replay (.w3g)", replayError: "Replay file too large (Max 10MB)", replayHint: "Supports .w3g, Max 10MB", submit: "Submit Report", history: "Report History", date: "Date", status: "Status", pending: "Pending", processed: "Banned", rejected: "Rejected", types: { mh: "MapHack", feed: "Intentional Feeding", afk: "AFK / Griefing", abuse: "Verbal Abuse", other: "Other" } },
        download: { title: "Download Center", subtitle: "Get the latest CC Battle Platform client and start your esports journey.", client: "Official Client", version: "Version", size: "Size", date: "Date", downloadBtn: "Download Now", requirements: "System Requirements", os: "OS", cpu: "Processor", ram: "Memory", storage: "Storage", drivers: "Graphics Drivers", manual: "Manual Update", warcraft: "Warcraft III (1.26)", maps: "Dota Map Pack", tools: "Tools" },
        platformUpdates: {
            title: "Platform Updates",
            subtitle: "View the latest platform updates and fixes.",
            noUpdates: "No updates found"
        },
        footer: { 
            aboutTitle: "ABOUT", 
            aboutText: "Dedicated to Warcraft III (v1.26) classic Dota 1 competitive experience. Carrying the blood, continuing the legend.", 
            seasonStart: "Season Start",
            seasonStartVal: "2026/3/1 00:00:00",
            seasonEnd: "Season End",
            seasonEndVal: "2026/6/1 00:00:00",
            status: "Status",
            statusVal: "In Progress",
            soloRank: "Solo Rank", 
            teamRank: "Team Rank", 
            banList: "Ban List", 
            support: "Support", 
            solo: "Solo Rank", 
            team: "Team Rank", 
            ban: "Ban List" 
        },
        contact: {
            title: "Contact Support",
            subtitle: "If you encounter any issues while using the platform, please contact us via the following methods.",
            qqGroup: "Official QQ Group",
            qqGroupDesc: "Join the group for real-time technical support and player communication.",
            email: "Official Email",
            emailDesc: "For business cooperation or appeals, please send an email to this address.",
            discord: "Discord Community",
            discordDesc: "Communication and feedback platform for international players.",
            workTime: "Service Hours",
            workTimeVal: "Mon - Sun 09:00 - 22:00 (UTC+8)",
            faq: "FAQ",
            faq1: "How to recover password?",
            ans1: "Click 'Forgot Password' on the login page and follow instructions sent to your email.",
            faq2: "Game is lagging, what to do?",
            ans2: "Try closing high-usage programs or lowering game graphics settings.",
            faq3: "How to appeal a ban?",
            ans3: "Send an email to our official address with details and evidence."
        },
        forgot: {
            title: "Forgot Password",
            subtitle: "Enter your registered email address and we'll send you a reset link.",
            email: "Email Address",
            emailHint: "Enter your registered email",
            emailError: "Please enter a valid email address",
            submit: "Send Reset Link",
            back: "Back to Login",
            success: "Reset link has been sent to your email.",
            fail: "Failed to send. Please check your email or try again later."
        },
        faqPage: {
            title: "Frequently Asked Questions (FAQ)",
            subtitle: "Basic operations and common questions for using the CC Battle Platform.",
            q0: "How to Start Playing on CC Battle Platform?",
            a0: "To start playing on CC Battle Platform, you only need WarCraft III, the CC launcher, and a CC account.\n\nGetting ready to start:\nYour WarCraft III: Frozen Throne must be version v1.26a.\n\n1. WarCraft III: <a href='/download#warcraft' class='text-accent hover:underline'>Go to Download Frozen Throne 1.26a</a>\n2. Create your CC Account: <a href='/register' class='text-accent hover:underline'>Go to Registration Page</a>\n3. Download and Install CC Launcher: <a href='/download#client' class='text-accent hover:underline'>Go to Download CC Platform</a>\n\nConnect to the server:\nNow you are ready to join the fight. Here are the last steps to connect to the server and play DotA or many custom maps:\n— Open the launcher and set the path to the WarCraft III exe, then click 'Start WarCraft III'\n— Choose 'CC Battle Platform' from the Battle.net gateways\n— Login with the account you created on our site and start playing.",
            q1: "How to register an account?",
            a1: "a. Desktop Client: Click the 'Register' button in the client.\nb. Web: Visit the official website registration page.",
            q2: "How to create a game?",
            a2: "a. Desktop Client: Click 'Create Game' in the lobby.\nb. Warcraft III Client: Click 'Create Game' in the custom game interface.\nc. Command Line: Use commands in the channel, e.g., /host xl83tb GoodGame",
            q3: "How to start a game?",
            a3: "a. Desktop Client: Click 'Start Game' when full or type /start.\nb. Warcraft III Client: Type /start in the chat when full.",
            q4: "How to check and set latency?",
            a4: "Check: Type /ping.\nSet: Type /lat [value], e.g., /lat 25 (Recommended 20-50).",
            q5: "What to do if a teammate is AFK, feeding, or griefing?",
            a5: "Type /votekick [player number] to start a vote. E.g., /votekick 5. Note: Only teammates can be kicked, requires unanimous vote.",
            q6: "How to end a game quickly?",
            a6: "Type -ff to vote for ending the game. Requires 4 votes from your team.",
            more: "View More Questions",
            noMore: "All FAQs displayed. Still have questions?",
            q7: "How to recover password?",
            a7: "Click 'Forgot Password' on the login page and follow instructions sent to your email.",
            q8: "Game is lagging, what to do?",
            a8: "Try closing high-usage programs or lowering game graphics settings.",
            q9: "How to appeal a ban?",
            a9: "Send an email to our official address with details and evidence.",
            q10: "How to join the official community?",
            a10: "You can join our official QQ group: 123456789, or visit our Discord channel for communication."
        },
        home: {
            featuresTitle: "PLATFORM FEATURES",
            match: { title: "Smart Matchmaking", desc: "Deeply optimized ELO algorithm ensures balanced matches for every game." },
            anticheat: { title: "Anti-Cheat System", desc: "Kernel-level driver protection detects MapHack and memory modifications in real-time." },
            squad: { title: "Squad Booking", desc: "Convenient battle lobby supporting custom rules and multiple maps for pro teams." },
            report: { title: "Reporting System", desc: "Dual audit by AI and humans ensures quick response to toxic behavior." }
        },
        ladder: { title: "Ladder Ranking", solo: "Solo Rank", team: "Team Rank", rank: "Rank", player: "Player", teamName: "Team", points: "Points", winRate: "Win Rate", games: "Games", trend: "Trend", signature: "Signature Heroes", level: "Level", loadMore: "Load More", region: "Region", status: "Status", online: "Online", offline: "Offline", ingame: "In-Game" },
        mapUpdates: {
            title: "Map Updates",
            subtitle: "Track the latest Dota 1 maps, compare version differences, and sync updates with one click.",
            popularMaps: "Popular Maps",
            comparison: "Version Comparison",
            update: "Sync Update",
            updating: "Updating...",
            updateSuccess: "Maps Updated",
            updateDesc: "3 map packages are currently available for update, including the latest balance patches.",
            heroComparison: "Hero Comparison",
            heroSelect: "Select Hero",
            aiModel: "AI Model",
            aiDisclaimer: "Data generated by AI in real-time, for reference only.",
            diff: {
                v683d: "Classic 6.83d",
                v688v: "Balanced 6.88v",
                v688x: "Fast 6.88x",
                stability: "Stability",
                balance: "Balance",
                features: "Features",
                popularity: "Popularity"
            },
            features: {
                v683d: "Classic competitive version with excellent balance.",
                v688v: "Optimized balance for better competitive experience.",
                v688x: "Fast competitive version with latest heroes and balance tweaks."
            },
            prompt: `You are a Dota 1 expert. Please analyze the differences of the hero "{hero}" across three map versions (6.83d, 6.88v, 6.88x).
      Please strictly return the data in the following JSON format, without any Markdown code block tags or extra text:
      {
        "id": "hero_id",
        "name": "{hero}",
        "stats": {
          "6.83d": { "strGrowth": "+2.0", "agiGrowth": "+2.9", "intGrowth": "+2.0", "moveSpeed": "305", "castPoint": "0.67", "skillChanges": "Brief description of skill characteristics" },
          "6.88v": { "strGrowth": "+2.3", "agiGrowth": "+2.9", "intGrowth": "+2.0", "moveSpeed": "310", "castPoint": "0.55", "skillChanges": "Brief description of balance adjustments" },
          "6.88x": { "strGrowth": "+2.5", "agiGrowth": "+3.3", "intGrowth": "+2.2", "moveSpeed": "315", "castPoint": "0.4", "skillChanges": "Brief description of 6.88x version changes" }
        }
      }
      Note: The values must reflect the true historical data of Dota 1 as accurately as possible.`,
            versions: {
                v683d: {
                    name: "Classic Competitive 6.83d",
                    description: "One of the most classic versions in Dota 1 history. Known for its extreme stability, it is the mainstream competitive version on major battle platforms. Although it lacks the talent system, its pure competitiveness is deeply loved by veteran players."
                },
                v688v: {
                    name: "Balanced & Stable 6.88v",
                    description: "Based on 6.83d, it has undergone massive balance tweaks and fixed many known bugs. It introduces some convenience features from later versions and is the first choice for players pursuing fair competition."
                },
                v688x: {
                    name: "Fast Competitive 6.88x",
                    description: "The recommended fast competitive version. Based on 6.88 with numerous optimizations, fixing many engine-related bugs. One of the most popular competitive maps currently."
                }
            },
            loading: "AI Analyzing...",
            retry: "Retry",
            table: {
                attributes: "Attributes / Skills",
                growth: "Str / Agi / Int Growth",
                moveSpeed: "Move Speed",
                castPoint: "Cast Point",
                coreChanges: "Core Changes",
                features: "Features",
                engineFixes: "Engine Fixes",
                bountyRunes: "Bounty Runes"
            },
            deepAnalysis: "In-depth Analysis: ",
            noHeroFound: "No matching hero found"
        },
        banList: {
            title: "Ban List Query",
            filterHint: "Only lists bans with a duration of 3 months (90 days) or more.",
            searchPlaceholder: "Enter Player ID to search...",
            table: {
                player: "Banned Player",
                reason: "Reason",
                date: "Ban Date",
                duration: "Duration",
                reporter: "Reporter",
                status: "Status"
            },
            durations: {
                permanent: "Permanent",
                days: "{n} Days"
            },
            status: {
                active: "Banned",
                expired: "Unbanned"
            },
            noResults: "No ban records found."
        },
        aiError: {
            notConfigured: "API key is not configured. Please check your environment variables.",
            insufficientBalance: "Call failed: Insufficient balance in your DeepSeek API account. Please recharge at the DeepSeek Open Platform.",
            quotaExhausted: "Call failed: Current API quota exhausted. Please try again later or check your billing details.",
            networkError: "Network connection failed. Unable to access backend interface. Please check your network.",
            unknown: "Call failed: ",
            default: "Sorry, the AI assistant is temporarily unavailable.",
            generateFail: "Generation failed. Please try again later."
        },
        chat: {
            title: "Online Support",
            subtitle: "24/7 support for platform usage, game mechanics, and more.",
            aiMode: "AI Assistant",
            humanMode: "Human Support",
            online: "Online",
            inputPlaceholder: "Type your question...",
            send: "Send",
            welcome: "Hello! I am the CC Battle Platform online assistant. How can I help you?",
            humanWelcome: "We have received your feedback. A human support agent is processing it. Please wait. We usually reply within 5-10 minutes.",
            systemInstruction: "You are an online customer service assistant for a Dota 1 competitive platform (CC Battle Platform). You need to answer players' questions about platform usage, map versions, hero data, reporting processes, etc., in a professional, enthusiastic, and concise manner. If a player asks about technical details you are unsure of, guide them to contact human support or check the FAQ.",
            deepseekError: "Sorry, the data returned by DeepSeek is in an abnormal format.",
            geminiError: "Sorry, I am temporarily unable to answer this question."
        }
    }
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  private platformId = inject(PLATFORM_ID);
  
  locale = signal<string>('zh_CN');
  
  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const savedLang = localStorage.getItem('lang');
      if (savedLang && messages[savedLang as keyof typeof messages]) {
        this.locale.set(savedLang);
      }
    }
  }

  setLocale(lang: string) {
    if (messages[lang as keyof typeof messages]) {
      this.locale.set(lang);
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem('lang', lang);
      }
    }
  }

  t(key: string): string {
    const keys = key.split('.');
    let obj: unknown = messages[this.locale() as keyof typeof messages] || messages['zh_CN'];
    for (const k of keys) {
      if (obj && typeof obj === 'object' && k in obj) {
        obj = (obj as Record<string, unknown>)[k];
      } else {
        // Fallback to zh_CN
        let fallback: unknown = messages['zh_CN'];
        for (const fk of keys) {
          if (fallback && typeof fallback === 'object' && fk in fallback) {
            fallback = (fallback as Record<string, unknown>)[fk];
          } else {
            return key;
          }
        }
        return fallback as string;
      }
    }
    return obj as string;
  }
}
