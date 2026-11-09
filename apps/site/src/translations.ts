export type Lang = 'en' | 'ar';

export interface TranslationDictionary {
  nav: {
    howItWorks: string;
    meetingMode: string;
    byok: string;
    pricing: string;
    faq: string;
    download: string;
    openApp: string;
    langToggle: string;
  };
  hero: {
    badge: string;
    title: string;
    subtitle: string;
    contrast: string;
    ctaPrimary: string;
    ctaSecondary: string;
    scrollHint: string;
  };
  howItWorks: {
    sectionTag: string;
    title: string;
    subtitle: string;
    step1Tag: string;
    step1Title: string;
    step1Desc: string;
    step2Tag: string;
    step2Title: string;
    step2Desc: string;
    step3Tag: string;
    step3Title: string;
    step3Desc: string;
    toolsTitle: string;
    toolsDesc: string;
  };
  meetingMode: {
    sectionTag: string;
    title: string;
    subtitle: string;
    f1Title: string;
    f1Desc: string;
    f2Title: string;
    f2Desc: string;
    f3Title: string;
    f3Desc: string;
    f4Title: string;
    f4Desc: string;
  };
  byok: {
    sectionTag: string;
    title: string;
    subtitle: string;
    honestTitle: string;
    honestDesc: string;
    yourKeyTitle: string;
    yourKeyDesc: string;
    ourKeyTitle: string;
    ourKeyDesc: string;
    securityTitle: string;
    securityDesc: string;
  };
  pricing: {
    sectionTag: string;
    title: string;
    subtitle: string;
    monthlyToggle: string;
    packsToggle: string;
    featuredBadge: string;
    currency: string;
    perMonth: string;
    creditsPerMonth: string;
    talkTime: string;
    maxRecording: string;
    subscribeBtn: string;
    comingSoon: string;
    rulesTitle: string;
    rule1Title: string;
    rule1Desc: string;
    rule2Title: string;
    rule2Desc: string;
    rule3Title: string;
    rule3Desc: string;
    rule4Title: string;
    rule4Desc: string;
    plans: {
      free: { name: string; tagline: string; talk: string; maxRec: string; desc: string };
      hobby: { name: string; tagline: string; talk: string; maxRec: string; desc: string };
      plus: { name: string; tagline: string; talk: string; maxRec: string; desc: string };
      pro: { name: string; tagline: string; talk: string; maxRec: string; desc: string };
      max: { name: string; tagline: string; talk: string; maxRec: string; desc: string };
      byok: { name: string; tagline: string; talk: string; maxRec: string; desc: string };
    };
    packs: {
      title: string;
      subtitle: string;
      starter: { name: string; price: string; credits: string };
      regular: { name: string; price: string; credits: string };
      pro: { name: string; price: string; credits: string };
      max: { name: string; price: string; credits: string };
    };
  };
  download: {
    sectionTag: string;
    title: string;
    subtitle: string;
    iosTitle: string;
    androidTitle: string;
    chromeTitle: string;
    webTitle: string;
    comingSoonBadge: string;
    openWebBtn: string;
  };
  faq: {
    sectionTag: string;
    title: string;
    subtitle: string;
    q1: string;
    a1: string;
    q2: string;
    a2: string;
    q3: string;
    a3: string;
    q4: string;
    a4: string;
    q5: string;
    a5: string;
    q6: string;
    a6: string;
  };
  footer: {
    tagline: string;
    rights: string;
    privacy: string;
    terms: string;
    github: string;
    legalNote: string;
  };
}

export const translations: Record<Lang, TranslationDictionary> = {
  en: {
    nav: {
      howItWorks: 'How it works',
      meetingMode: 'Meeting Mode',
      byok: 'Your AI (BYOK)',
      pricing: 'Pricing',
      faq: 'FAQ',
      download: 'Download',
      openApp: 'Open App',
      langToggle: 'العربية',
    },
    hero: {
      badge: 'Voice-first thinking app',
      title: 'Talk. Get organised thoughts.',
      subtitle:
        'You press record and talk the way you actually think — messy, out of order, doubling back. MindSpace listens, works out the separate ideas inside what you said, rewrites each one as a clean sentence in your own voice, and lays them out as sticky notes you can move, nest, group and revisit.',
      contrast:
        'It is not a transcription app. A transcript gives you back the mess. MindSpace gives you back the thinking.',
      ctaPrimary: 'Open Web App',
      ctaSecondary: 'See How It Works',
      scrollHint: 'Scroll to explore',
    },
    howItWorks: {
      sectionTag: 'Architecture of Thought',
      title: 'From raw speech to structured clarity',
      subtitle: 'Capture at the speed of speech, structure at the quality of writing.',
      step1Tag: '01. Talk',
      step1Title: 'Capture without typing or filtering',
      step1Desc:
        'Press the microphone and talk freely in Arabic or English. Say everything in any order without tidying as you go. Audio streams securely for transcription preserving your slang, tone, and nuances.',
      step2Tag: '02. Notes',
      step2Title: 'Idea extraction & faithful rewriting',
      step2Desc:
        'The AI separates distinct thoughts into individual notes — not raw sentence chunks. Filler words and stuttering are stripped, leaving clean titles and concise bodies colour-coded by type: idea, task, question, or decision.',
      step3Tag: '03. Map',
      step3Title: 'Spatial canvas, sub-notes & calendar',
      step3Desc:
        'Arrange thoughts on an infinite canvas. Drill into any note with child sub-notes orbiting their parent. Switch anytime to linear list or calendar view with automatic date resolution and local reminders.',
      toolsTitle: 'Deliberately 6 Canvas Tools',
      toolsDesc:
        'Add Note • Add Group Frame • Tidy Grid • Fit to View • Recordings Log • Show/Hide Sub-notes. No cluttered menus.',
    },
    meetingMode: {
      sectionTag: 'Meeting Mode',
      title: 'Turn meetings into organized spaces',
      subtitle:
        'A dedicated Chrome MV3 extension records tab audio and microphone in Google Meet, Zoom, and Teams web, generating a complete space of interconnected notes.',
      f1Title: 'Consent First',
      f1Desc:
        'Mandatory participant consent notice before recording starts. Respects local legal requirements and privacy regulations.',
      f2Title: 'Crash-Proof IndexedDB Rotation',
      f2Desc:
        'Splits audio into independent 5-minute chunks stored locally in browser IndexedDB before upload. A tab crash loses at most the current slice.',
      f3Title: 'Bounded Server Pipeline',
      f3Desc:
        'Long meeting audio is transcribed with bounded concurrency, reassembled in order, and processed for structured action items and decisions.',
      f4Title: 'Dedicated Meeting Space',
      f4Desc:
        'Every meeting automatically becomes its own workspace on your canvas, ready to review, tidy, export, or branch.',
    },
    byok: {
      sectionTag: 'Transparency & Control',
      title: 'Bring Your Own AI (BYOK)',
      subtitle:
        'Already paying OpenAI, Anthropic, or Google? Use your own API key for text processing so you never pay twice.',
      honestTitle: 'An Honest Architectural Split',
      honestDesc:
        'Speech-to-text always runs on platform credits to guarantee container decoding, while text extraction runs on your personal key.',
      yourKeyTitle: 'On Your Key (0 MindSpace credits)',
      yourKeyDesc:
        'Idea extraction, note writing, and rewriting run directly through your provider (OpenAI GPT, Anthropic Claude, Google Gemini) billed at your rates.',
      ourKeyTitle: 'On Our Credits (Voice transcription)',
      ourKeyDesc:
        'Voice-to-text uses our high-reliability transcription pipeline, covered by the included 900 credits (~2.5 hours of talking per month).',
      securityTitle: 'Zero Client Key Exposure',
      securityDesc:
        'Your API keys are encrypted server-side with AES-256-GCM and never returned to any client or browser. Only the last 4 characters are shown as a hint.',
    },
    pricing: {
      sectionTag: 'Fair Pricing',
      title: 'Honest pricing in Egyptian Pounds (EGP)',
      subtitle:
        'All plans include our reserve-then-settle guarantee: you are never charged for a failed recording.',
      monthlyToggle: 'Monthly Subscriptions',
      packsToggle: 'One-Time Credit Packs',
      featuredBadge: 'Most Popular',
      currency: 'EGP',
      perMonth: '/month',
      creditsPerMonth: 'credits/mo',
      talkTime: 'Talk time',
      maxRecording: 'Max single recording',
      subscribeBtn: 'Choose Plan',
      comingSoon: 'Coming soon',
      rulesTitle: 'The Four Pricing Principles',
      rule1Title: 'Reserve, Then Settle',
      rule1Desc:
        'An estimated credit hold is placed before processing. Upon completion, only actual compute is billed. If a job fails, the hold is released in full.',
      rule2Title: 'Monthly 100 Credit Safety Floor',
      rule2Desc:
        'On the 1st of every month, every account sitting below 100 credits is automatically topped up back to 100.',
      rule3Title: 'Volume Rewards Commitment',
      rule3Desc:
        'Higher tiers provide progressively higher bonus credits (up to +60%), and subscriptions always beat one-time top-ups.',
      rule4Title: 'Per-Tier Recording Caps & Split BYOK',
      rule4Desc:
        'Each plan caps single-recording length (5 min on Free up to 120 min on Max & BYOK), and BYOK splits billing cleanly: your key for text, our credits for speech.',
      plans: {
        free: {
          name: 'Free',
          tagline: 'Every board, every note — think it through yourself',
          talk: '~11 min',
          maxRec: '5 min cap',
          desc: '100 credits monthly floor. Full canvas, list and calendar views. Manual notes and organization.',
        },
        hobby: {
          name: 'Hobby',
          tagline: 'For the odd thought worth keeping',
          talk: '~69 min',
          maxRec: '15 min cap',
          desc: '625 credits (500 base + 25% bonus). Automatic AI transcription and note extraction.',
        },
        plus: {
          name: 'Plus',
          tagline: 'A habit, not an experiment',
          talk: '~3.8 hours',
          maxRec: '30 min cap',
          desc: '2,025 credits (1,500 base + 35% bonus). Ideal for daily voice brainstorming and task planning.',
        },
        pro: {
          name: 'Pro',
          tagline: 'Thinking out loud every day',
          talk: '~8.3 hours',
          maxRec: '60 min cap',
          desc: '4,500 credits (3,000 base + 50% bonus). Generous recording allowances for power users and consultants.',
        },
        max: {
          name: 'Max',
          tagline: 'Everything, all of it, no counting',
          talk: '~14.8 hours',
          maxRec: '120 min cap',
          desc: '8,000 credits (5,000 base + 60% bonus). 2-hour continuous recordings for lectures and workshops.',
        },
        byok: {
          name: 'Your AI',
          tagline: 'Your key for the thinking, our credits for the listening',
          talk: '~2.5 hours',
          maxRec: '120 min cap',
          desc: '900 base credits for voice STT. Text extraction runs on your own OpenAI, Anthropic, or Gemini key.',
        },
      },
      packs: {
        title: 'One-Time Credit Packs',
        subtitle: 'Need extra talking time? Top up your balance anytime without changing plans.',
        starter: { name: 'Starter', price: '50 EGP', credits: '550 credits (500 + 10% bonus)' },
        regular: { name: 'Regular', price: '100 EGP', credits: '1,200 credits (1,000 + 20% bonus) ⭐' },
        pro: { name: 'Pro', price: '250 EGP', credits: '3,250 credits (2,500 + 30% bonus)' },
        max: { name: 'Max', price: '500 EGP', credits: '7,000 credits (5,000 + 40% bonus)' },
      },
    },
    download: {
      sectionTag: 'Platforms',
      title: 'Think freely across all your devices',
      subtitle: 'Capturing thoughts wherever you are — on mobile, in the browser, or during meetings.',
      iosTitle: 'iOS App',
      androidTitle: 'Android App',
      chromeTitle: 'Chrome Extension',
      webTitle: 'Web Application',
      comingSoonBadge: 'Coming soon',
      openWebBtn: 'Launch in Browser',
    },
    faq: {
      sectionTag: 'Answers',
      title: 'Frequently Asked Questions',
      subtitle: 'Real technical and product facts straight from our documentation.',
      q1: 'How is MindSpace different from a voice recorder or transcription app?',
      a1: 'Voice memos create an unsearchable audio pile you never listen to. Transcription apps dump a raw wall of text that still requires manual sorting. MindSpace extracts the distinct ideas buried in messy speech, rewrites each cleanly in your own voice, and places them as actionable cards on a canvas.',
      q2: 'Does it support Arabic and Egyptian dialect?',
      a2: 'Yes. MindSpace was built with the Egyptian market in mind. It handles Egyptian colloquial Arabic and English seamlessly. The AI responds and rewrites your thoughts in whichever language and dialect you spoke in.',
      q3: 'What happens if a recording or server connection fails?',
      a3: 'You are never charged for failed jobs. We use a reserve-then-settle credit model: the estimated cost is held before processing and released immediately if an error occurs. In Meeting Mode, audio is kept locally in browser storage until confirmed uploaded.',
      q4: 'How does Bring Your Own AI (BYOK) work?',
      a4: 'If you have an API key from OpenAI, Anthropic, or Google, MindSpace uses your key for idea extraction and card writing (charging you 0 MindSpace credits). Voice transcription always runs on our platform models using your included credits to ensure reliable audio handling.',
      q5: 'Can I view my thoughts as a list or calendar instead of a canvas?',
      a5: 'Yes. You can toggle between the spatial Canvas view and a linear List view anytime. The List view includes a calendar tab that maps notes by their deadlines (extracted automatically from your speech) or creation date.',
      q6: 'How is my private data and audio protected?',
      a6: 'Your data is secured per-row with PostgreSQL Row-Level Security — one account cannot read another. API keys are encrypted server-side with AES-256-GCM. Reminder alerts fire locally on device without external sync, and deleting your account permanently removes all spaces, recordings, and ledger data.',
    },
    footer: {
      tagline: 'Talk, and think properly afterwards.',
      rights: 'MindSpace. All rights reserved.',
      privacy: 'Privacy Policy',
      terms: 'Terms of Service',
      github: 'GitHub Repository',
      legalNote: 'Draft documents subject to legal review.',
    },
  },
  ar: {
    nav: {
      howItWorks: 'إزاي بيشتغل',
      meetingMode: 'وضع الاجتماعات',
      byok: 'مفتاحك معاك (BYOK)',
      pricing: 'الأسعار',
      faq: 'الأسئلة الشائعة',
      download: 'التحميل',
      openApp: 'فتح التطبيق',
      langToggle: 'English',
    },
    hero: {
      badge: 'تطبيق التفكير بالصوت',
      title: 'تكلّم. وأفكارك تترتب.',
      subtitle:
        'دوس على المايك واتكلم بطبيعتك — ملخبط، ورا بعض، بترجع في كلامك. مايند سبيس بيسمع، يفهم الأفكار المستقلة جوه كلامك، يصيغ كل فكرة بجملة واضحة ومحددة وبنفس نبرة صوتك، ويرتبها على شكل كروت تفكير تقدر تحركها وتجمعها وتفكر فيها براحتك.',
      contrast:
        'مش تطبيق تفريغ صوت لكلام عادي. التفريغ بيسلّمك نفس الدوشة؛ مايند سبيس بيرجعلك الفكرة الصافية اللي تستاهل تحتفظ بيها.',
      ctaPrimary: 'ابدأ على الويب',
      ctaSecondary: 'شوف إزاي بيشتغل',
      scrollHint: 'انزل تحت لاستكشاف المزيد',
    },
    howItWorks: {
      sectionTag: 'هندسة التفكير',
      title: 'من صوت تلقائي لأفكار واضحة ومنظمة',
      subtitle: 'التقاط بسرعة الكلام، وتنظيم بجودة الكتابة المدروسة.',
      step1Tag: '01. سجّل',
      step1Title: 'احكي براحتك بدون كتابة ولا تكلّف',
      step1Desc:
        'دوس على المايك وسجل بالعربي أو بالإنجليزي. قول كل اللي في بالك بدون ما تحاول ترتب وأنت بتتكلم — دي مهمة التطبيق. الصوت بيترفع بأمان ويتحول لكلام محتفظاً بلهجتك ونبرتك.',
      step2Tag: '02. أفكار في كروت',
      step2Title: 'استخراج الأفكار وصياغتها بأمانة',
      step2Desc:
        'الذكاء الاصطناعي بيفرز الأفكار المستقلة في كروت منفصلة، مش مجرد جمل عشوائية. بيشيل التردد واللخبطة ("اممم"، التأتأة، والرجوع في الكلام)، ويصيغ كل كارت بعنوان ومحتوى واضح مع تمييز لوني (فكرة، مهمة، سؤال، قرار).',
      step3Tag: '03. خريطة تفكير',
      step3Title: 'كانفاس لانهائي، كروت فرعية، وتقويم',
      step3Desc:
        'رتب أفكارك على لوحة كانفاس لانهائية. اتعمق جوه أي فكرة بكروت فرعية بتلف حوالين الفكرة الأم بخطوط ربط واضحة. وفي أي وقت، تقدر تقلب للشكل الخطي أو التقويم مع استخراج تلقائي للمواعيد وتنبيهات محلية.',
      toolsTitle: '6 أدوات محددة للكانفاس فقط',
      toolsDesc:
        'إضافة كارت • إضافة إطار تجميع • ترتيب شبكي بنقرة • ملاءمة الشاشة • سجل التسجيلات • إظهار/إخفاء الكروت الفرعية. بدون قوائم معقدة.',
    },
    meetingMode: {
      sectionTag: 'وضع الاجتماعات',
      title: 'حوّل أي اجتماع لمساحة أفكار كاملة',
      subtitle:
        'إضافة كروم مخصصة بتسجل صوت التاب والمايك في Google Meet و Zoom و Teams، وتطلعلك مساحة عمل كاملة بالأفكار والقرارات.',
      f1Title: 'الموافقة الصريحة أولاً',
      f1Desc:
        'تنبيه إلزامي بالموافقة قبل بدء التسجيل، احتراماً لقوانين الخصوصية وحق كل المشاركين في العلم بالتسجيل.',
      f2Title: 'تسجيل آمن مابيضيعش في IndexedDB',
      f2Desc:
        'الصوت بيتقسم ويتحفظ في جهازك كل 5 دقائق قبل رفعه للسيرفر. لو المتصفح قفل فجأة، مش هيضيع غير آخر جزء بس.',
      f3Title: 'معالجة ذكية ومحددة',
      f3Desc:
        'الصوت بيتحول لنص مع إدارة دقيقة للعمليات، وبعدها بيتجمع ويستخرج منه القرارات وخطوات العمل بوضوح.',
      f4Title: 'مساحة خاصة لكل اجتماع',
      f4Desc:
        'كل اجتماع بيتحول لمساحة عمل مستقلة على الكانفاس، جاهزة للترتيب والتنقيح والتصدير في أي وقت.',
    },
    byok: {
      sectionTag: 'حرية وتحكم كامل',
      title: 'هات الذكاء الاصطناعي بتاعك (BYOK)',
      subtitle:
        'لو عندك اشتراك بالفعل في OpenAI أو Anthropic أو Google، حط مفتاح الـ API ومش هتدفع تمن كتابة الأفكار مرتين.',
      honestTitle: 'تقسيم تقني واضح وصادق',
      honestDesc:
        'تحويل الصوت لكلام دايماً بيشتغل على سيرفراتنا عشان نضمن ثبات الدقة وفك تشفير الصوت، بينما استخراج وصياغة الأفكار بيشتغل على مفتاحك مباشرة.',
      yourKeyTitle: 'على حسابك (0 كريديت لمايند سبيس)',
      yourKeyDesc:
        'استخراج الأفكار وصياغتها وتعديل الكروت بيشتغل بمفتاحك المباشر مع مزودك المفضل (GPT أو Claude أو Gemini) بأسعاره المباشرة.',
      ourKeyTitle: 'على رصيدنا (تحويل الصوت لكلام)',
      ourKeyDesc:
        'التفريغ الصوتي بيتم عبر سيرفراتنا الموثوقة ومغطى بالـ 900 كريديت المتضمنة في الباقة (حوالي ساعتين ونصف كلام شهرياً).',
      securityTitle: 'المفاتيح مبتخرجش للمتصفح أبداً',
      securityDesc:
        'مفاتيح الـ API بتتخزن وتتشفّر على السيرفر بـ AES-256-GCM ومبتظهرش في المتصفح بعد الحفظ، بيظهر بس آخر 4 حروف للتذكير.',
    },
    pricing: {
      sectionTag: 'تسعير عادل',
      title: 'باقات وأسعار بالجنيه المصري (EGP)',
      subtitle:
        'كل الباقات بتشمل نظام الحجز ثم التسوية: مستحيل تدفع مليم على تسجيل منجحش أو واجه مشكلة.',
      monthlyToggle: 'الاشتراكات الشهرية',
      packsToggle: 'باقات الشحن الإضافي',
      featuredBadge: 'الأكثر طلباً',
      currency: 'ج.م',
      perMonth: '/شهرياً',
      creditsPerMonth: 'كريديت/شهر',
      talkTime: 'وقت الكلام',
      maxRecording: 'أقصى مدة للتسجيل',
      subscribeBtn: 'اشترك الآن',
      comingSoon: 'قريباً',
      rulesTitle: 'المبادئ الأربعة لنظام التسعير',
      rule1Title: 'احجز، ثم ادفع اللي استخدمته فقط',
      rule1Desc:
        'التكلفة التقديرية بتتحجز مؤقتاً قبل ما العملية تبدأ. بعد ما تخلص، بيتخصم التكلفة الحقيقية فقط. ولو حصل أي خطأ، الرصيد المحجوز بيرجع كامل.',
      rule2Title: 'حد أدنى 100 كريديت شهرياً للجميع',
      rule2Desc:
        'يوم 1 من كل شهر، أي حساب رصيده أقل من 100 كريديت بيرجع تلقائياً لـ 100 كريديت أمان.',
      rule3Title: 'الباقات الكبيرة أوفر، والاشتراك يكسب',
      rule3Desc:
        'كل ما الباقة تكبر بتاخد بونص أكبر بيوصل لـ +60% كريديت، والاشتراك الشهري دايماً أوفر من باقات الشحن الفردية.',
      rule4Title: 'حد أقصى للتسجيل وتقسيم واضح للـ BYOK',
      rule4Desc:
        'كل باقة ليها حد أقصى لمدة التسجيل الواحد (من 5 دقائق لحد 120 دقيقة في باقتي Max و BYOK)، وباقة مفتاحك الخاص بتفصل بوضوح: مفتاحك للنصوص، وكريديتنا للصوت.',
      plans: {
        free: {
          name: 'المجانية (Free)',
          tagline: 'كل بورد وكل كارت — فكر ورتب بنفسك',
          talk: '~11 دقيقة',
          maxRec: 'حد أقصى 5 دقائق',
          desc: '100 كريديت شهرياً. كانفاس كامل، طريقة القائمة والتقويم، تنظيم يدوي بدون حدود.',
        },
        hobby: {
          name: 'هواية (Hobby)',
          tagline: 'للأفكار العابرة اللي تستاهل تحتفظ بيها',
          talk: '~69 دقيقة',
          maxRec: 'حد أقصى 15 دقيقة',
          desc: '625 كريديت (500 أساسي + 25% بونص). تحويل صوتي واستخراج أفكار بالذكاء الاصطناعي.',
        },
        plus: {
          name: 'بلس (Plus)',
          tagline: 'عادة يومية مش مجرد تجربة',
          talk: '~3.8 ساعة',
          maxRec: 'حد أقصى 30 دقيقة',
          desc: '2,025 كريديت (1,500 أساسي + 35% بونص). الباقة المثالية للعصف الذهني اليومي والتخطيط.',
        },
        pro: {
          name: 'برو (Pro)',
          tagline: 'بتفكر بصوت عالي كل يوم',
          talk: '~8.3 ساعة',
          maxRec: 'حد أقصى 60 دقيقة',
          desc: '4,500 كريديت (3,000 أساسي + 50% بونص). للمحترفين والاستشاريين وجلسات العمل المكثفة.',
        },
        max: {
          name: 'ماكس (Max)',
          tagline: 'كل حاجة، بدون ما تعد ولا تحسب',
          talk: '~14.8 ساعة',
          maxRec: 'حد أقصى 120 دقيقة',
          desc: '8,000 كريديت (5,000 أساسي + 60% بونص). تسجيل متواصل حتى ساعتين للمحاضرات وورش العمل.',
        },
        byok: {
          name: 'ذكاؤك الخاص (Your AI)',
          tagline: 'مفتاحك للتفكير، وكريديتنا للاستماع',
          talk: '~2.5 ساعة',
          maxRec: 'حد أقصى 120 دقيقة',
          desc: '900 كريديت لتحويل الصوت لكلام. واستخراج وصياغة الأفكار بيشتغل بمفتاحك في OpenAI أو Claude أو Gemini.',
        },
      },
      packs: {
        title: 'باقات الكريديت لمرة واحدة',
        subtitle: 'محتاج وقت كلام إضافي بدون تغيير باقتك الشهرية؟ اشحن رصيدك في أي وقت.',
        starter: { name: 'بداية (Starter)', price: '50 ج.م', credits: '550 كريديت (500 + 10% بونص)' },
        regular: { name: 'عادية (Regular)', price: '100 ج.م', credits: '1,200 كريديت (1,000 + 20% بونص) ⭐' },
        pro: { name: 'برو (Pro)', price: '250 ج.م', credits: '3,250 كريديت (2,500 + 30% بونص)' },
        max: { name: 'ماكس (Max)', price: '500 ج.م', credits: '7,000 كريديت (5,000 + 40% بونص)' },
      },
    },
    download: {
      sectionTag: 'المنصات',
      title: 'فكر بحرية على كل أجهزتك',
      subtitle: 'التقط أفكارك أينما كنت — على الموبايل، المتصفح، أو أثناء اجتماعاتك.',
      iosTitle: 'تطبيق الآيفون (iOS)',
      androidTitle: 'تطبيق الأندرويد',
      chromeTitle: 'إضافة متصفح كروم',
      webTitle: 'تطبيق الويب',
      comingSoonBadge: 'قريباً',
      openWebBtn: 'افتح في المتصفح',
    },
    faq: {
      sectionTag: 'إجابات واضحة',
      title: 'الأسئلة الشائعة',
      subtitle: 'حقائق تقنية ومعلومات دقيقة مباشرة من توثيق منتجنا.',
      q1: 'إيه الفرق بين مايند سبيس وتطبيقات تسجيل الصوت أو التفريغ العادية؟',
      a1: 'التسجيلات الصوتية بتتحول لكومة مجهولة مبتسمعهاش تاني. وتطبيقات التفريغ بترميلك دش كلام غير مرتب بيحتاج فرز يدوي. مايند سبيس بيطلع الأفكار الصافية المستقلة من كلامك الملخبط، يصيغها بوضوح في جمل مفيدة وبنبرتك، ويحطها ككروت مرتبة على لوحة تفكير واسعة.',
      q2: 'هل التطبيق بيدعم العامية المصرية واللغة العربية كويس؟',
      a2: 'أيوه، مايند سبيس متصمم خصيصاً للمنطقة والمستخدم المصري. بيتعامل مع العامية المصرية والإنجليزي بسلاسة تامة، والذكاء الاصطناعي بيجاوبك ويصيغ أفكارك بنفس اللغة واللهجة اللي اتكلمت بيها.',
      q3: 'إيه اللي بيحصل لو التسجيل أو النت فصل أثناء المعالجة؟',
      a3: 'مستحيل تدفع مليم على عملية فشلت. بنستخدم نظام حجز الرصيد ثم التسوية: التكلفة التقديرية بتتحجز مؤقتاً وبترجع فوراً لو حصل أي فشل. وفي وضع الاجتماعات، الصوت بيتحفظ محلياً في جهازك لحد ما التأكيد يوصل للسيرفر.',
      q4: 'إزاي بيشتغل خيار مفتاحك معاك (BYOK)؟',
      a4: 'لو عندك مفتاح API من OpenAI أو Anthropic أو Google، مايند سبيس بيستعمله لكتابة وصياغة الكروت بدون أي كريديت مننا (0 كريديت). لكن تحويل الصوت لكلام دايماً بيشتغل على سيرفراتنا وبخصم من الـ 900 كريديت المتضمنة لضمان دقة التعرف على الصوت.',
      q5: 'هل أقدر أشوف أفكاري كقائمة أو تقويم بدل الكانفاس؟',
      a5: 'طبعاً. تقدر تحول في أي لحظة بين الكانفاس الحر وطريقة عرض القائمة العادية. والقائمة فيها تاب للتقويم بيفرز الأفكار حسب مواعيد تسليمها (اللي الذكاء الاصطناعي بيفهمها من صوتك تلقائياً) أو تاريخ تسجيلها.',
      q6: 'إزاي بياناتي وتسجيلاتي الصوتية محمية وفي أمان؟',
      a6: 'بياناتك معزولة على مستوى قاعدة البيانات (Row-Level Security) بحيث مستحيل حساب يوصل لكروت حساب تاني. ومفاتيح الـ API بتتخزن مشفرة على السيرفر ومش بتنزل للمتصفح. وتنبيهات المواعيد بتشتغل محلياً في جهازك بدون إرسال جدولك لسيرفرات خارجية، وحذف الحساب بيحذف كل أفكارك وتسجيلاتك نهائياً.',
    },
    footer: {
      tagline: 'تكلّم، وفكّر صح بعد كدة.',
      rights: 'مايند سبيس. جميع الحقوق محفوظة.',
      privacy: 'سياسة الخصوصية',
      terms: 'شروط الاستخدام',
      github: 'مستودع GitHub',
      legalNote: 'مسودات قانونية قيد المراجعة الرسمية.',
    },
  },
};
