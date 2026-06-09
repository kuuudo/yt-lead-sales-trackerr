export type Language = 'en' | 'tw';

export const translations = {
  en: {
    nav: {
      dashboard: 'Summary',
      campaigns: 'Campaigns',
      videos: 'Content',
      analytics: 'Analytics',
      installation: 'Setup',
      settings: 'Settings',
      logout: 'Logout',
    },
    auth: {
      signin: 'Sign In',
      signup: 'Create Account',
      email: 'Email Address',
      password: 'Password',
      noAccount: "Don't have an account?",
      hasAccount: 'Already have an account?',
      welcome: 'Welcome Back',
    },
    dashboard: {
      title: 'Revenue Intelligence',
      topPerformers: 'Top Performing Content',
      health: 'Tracking Health',
      metrics: {
        revenue: 'Total Revenue',
        rpc: 'Revenue Per Click',
        optins: 'Newsletter Opt-ins',
        calls: 'Sales Calls',
      }
    },
    campaigns: {
      title: 'Funnel Setup',
      create: 'New Campaign',
      form: {
        basic: 'Basic Info',
        newsletter: 'Newsletter Funnel',
        salesCall: 'High Ticket / Sales Call',
        consultation: 'Paid Consultation',
        price: 'Offer Price ($)',
        closeRate: 'Est. Close Rate (%)',
        fee: 'Consultation Fee ($)',
        hasSalesCall: 'Include Sales Call?',
        hasConsultation: 'Include Paid Consultation?',
        leadMagnet: 'Lead Magnet System',
      }
    },
    videos: {
      title: 'Content Library',
      add: 'Track New Content',
      objective: 'Primary Objective',
      status: {
        active: 'Active',
        noData: 'No Data Yet',
        installed: 'Tracking Installed',
        missing: 'Missing Data',
        error: 'Error Detected',
      },
      objectives: {
        newsletter: 'Newsletter Growth',
        calls: 'Sales Call Booking',
        consult: 'Paid Consultation',
        sales: 'Direct Sales',
        viral: 'Awareness / Viral',
      },
      hasLeadMagnet: 'Has Lead Magnet?',
      selectLeadMagnets: 'Select Lead Magnets',
      selectCampaignFirst: 'Please select a campaign first.',
      noLeadMagnetsFound: 'No lead magnets found for this campaign.',
    },
    filters: {
      search: 'Search videos...',
      goal: 'Filter by Goal',
      leadMagnet: 'Filter by Lead Magnet',
      date: 'Date Range',
      sort: 'Sort By',
      noResults: 'No videos match your filters.',
      ranges: {
        all: 'All Time',
        last7: 'Last 7 Days',
        last30: 'Last 30 Days',
        last3m: 'Last 3 Months',
        last6m: 'Last 6 Months',
        last12m: 'Last 12 Months',
        custom: 'Custom Range'
      },
      sorting: {
        newest: 'Newest Added',
        oldest: 'Oldest Added',
        recentPublished: 'Recent Published'
      }
    },
    analytics: {
      title: 'Advanced Reporting',
      funnel: 'Funnel Conversion',
      revenueRange: 'Revenue Attribution',
    }
  },
  tw: {
    nav: {
      dashboard: '概覽',
      campaigns: '營銷活動',
      videos: '影片列表',
      analytics: '深度分析',
      installation: '安裝設置',
      settings: '設置',
      logout: '登出',
    },
    auth: {
      signin: '登入',
      signup: '註冊帳號',
      email: '電子郵件',
      password: '密碼',
      noAccount: '尚未擁有帳號？',
      hasAccount: '已經有帳號了？',
      welcome: '歡迎回來',
    },
    dashboard: {
      title: '營收情報系統',
      topPerformers: '高轉化內容',
      health: '追蹤狀態',
      metrics: {
        revenue: '總累積額',
        rpc: '點擊價值',
        optins: '名單訂閱',
        calls: '預約通話',
      }
    },
    campaigns: {
      title: '漏斗設置',
      create: '建立活動',
      form: {
        basic: '基本資訊',
        newsletter: '電子報漏斗',
        salesCall: '高客單價 / 成交電話',
        consultation: '付費諮詢',
        price: '產品售價 ($)',
        closeRate: '預計成交率 (%)',
        fee: '諮詢費用 ($)',
        hasSalesCall: '包含電話成交？',
        hasConsultation: '包含付費諮詢？',
        leadMagnet: '磁鐵名單系統',
      }
    },
    videos: {
      title: '受追蹤影片',
      add: '追蹤新影片',
      objective: '主要目標',
      status: {
        active: '數據活躍',
        noData: '尚無數據',
        installed: '追蹤已安裝',
        missing: '轉化缺失',
        error: '偵測到錯誤',
      },
      objectives: {
        newsletter: '電子報增長',
        calls: '預約策略通話',
        consult: '付費諮詢預約',
        sales: '直接產品銷售',
        viral: '流量曝光 / 病毒增長',
      },
      hasLeadMagnet: '包含磁鐵名單？',
      selectLeadMagnets: '選擇磁鐵名單',
      selectCampaignFirst: '請先選擇營銷活動。',
      noLeadMagnetsFound: '此活動尚未設置磁鐵名單。',
    },
    filters: {
      search: '搜尋影片...',
      goal: '按目標篩選',
      leadMagnet: '按磁鐵名單篩選',
      date: '日期範圍',
      sort: '排序方式',
      noResults: '沒有符合篩選條件的影片。',
      ranges: {
        all: '全部時間',
        last7: '最近 7 天',
        last30: '最近 30 天',
        last3m: '最近 3 個月',
        last6m: '最近 6 個月',
        last12m: '最近 12 個月',
        custom: '自定義範圍'
      },
      sorting: {
        newest: '最新添加',
        oldest: '最早添加',
        recentPublished: '最近發佈'
      }
    },
    analytics: {
      title: '深度報告',
      funnel: '漏斗轉化',
      revenueRange: '營收歸因',
    }
  }
};
