/**
 * Inbox sorter — classification rules.
 *
 * Pure logic, no Apps Script services, so it can be unit-tested with Node
 * (see test/classifier.test.js). Edit the lists below to tune the sorting.
 */

// Order matters: it is the order of the groups in the add-on.
// pinned  = always stays in the inbox (the mail that needs you).
// clean   = when auto-clean is on, remove from the inbox after N hours
//           (0 = right away). markRead also marks it as read.
// icon    = Material icon name (fonts.google.com/icons); iconUrl wins when set.
var BUNDLES = [
  { key: 'people',   name: 'People',        label: 'Sorted/People',       icon: 'person', pinned: true,
    hint: 'Written by a person, messages, shares, invites', color: { bg: '#16a766', text: '#ffffff' } },
  { key: 'apply',    name: 'Applications',  label: 'Sorted/Applications', icon: 'work', pinned: true, star: true,
    hint: 'Replies to your job applications', color: { bg: '#4a86e8', text: '#ffffff' } },
  { key: 'security', name: 'Security',      label: 'Sorted/Security',     icon: 'shield', pinned: true,
    hint: 'Sign-ins, passwords, account access', color: { bg: '#fb4c2f', text: '#ffffff' } },
  { key: 'codes',    name: 'Codes',         label: 'Sorted/Codes',        icon: 'key', clean: { afterHours: 0.5, markRead: true },
    hint: 'One-time codes, verify and reset links', color: { bg: '#999999', text: '#ffffff' } },
  { key: 'google',   name: 'Google',        label: 'Sorted/Google',       icon: 'apps', clean: { afterHours: 0 },
    iconUrl: 'https://www.gstatic.com/images/branding/product/1x/googleg_48dp.png',
    hint: 'Search Console, AdSense, Cloud, Play…', color: { bg: '#fad165', text: '#000000' } },
  { key: 'jobs',     name: 'Job alerts',    label: 'Sorted/Job alerts',   icon: 'work_history', clean: { afterHours: 0 },
    hint: 'Job boards and recommendations', color: { bg: '#a479e2', text: '#ffffff' } },
  { key: 'money',    name: 'Money',         label: 'Sorted/Money',        icon: 'receipt_long', clean: { afterHours: 72 },
    hint: 'Invoices, receipts, bank, payments', color: { bg: '#43d692', text: '#000000' } },
  { key: 'shopping', name: 'Shopping',      label: 'Sorted/Shopping',     icon: 'local_shipping', clean: { afterHours: 72 },
    hint: 'Orders and deliveries', color: { bg: '#f691b3', text: '#000000' } },
  { key: 'updates',  name: 'Updates',       label: 'Sorted/Updates',      icon: 'notifications', clean: { afterHours: 0 },
    hint: 'Newsletters, social, promotions, other notices', color: { bg: '#cccccc', text: '#000000' } }
];

// Webmail domains: never learn or apply a rule for a whole domain like these.
var PERSONAL_DOMAINS = ['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com',
  'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'aol.com', 'gmx.com', 'yandex.com'];

// ---------------------------------------------------------------------------
// Known senders
// ---------------------------------------------------------------------------

// Applicant tracking systems: companies answer your application through these.
var ATS_DOMAINS = [
  'greenhouse.io', 'greenhouse-mail.io', 'lever.co', 'ashbyhq.com', 'workable.com', 'workablemail.com',
  'smartrecruiters.com', 'teamtailor.com', 'teamtailor-mail.com', 'myworkday.com', 'myworkdayjobs.com',
  'icims.com', 'recruitee.com', 'bamboohr.com', 'jobvite.com', 'personio.com', 'personio.de', 'breezy.hr',
  'pinpointhq.com', 'applytojob.com', 'jazzhr.com', 'successfactors.com', 'successfactors.eu', 'taleo.net',
  'hirehive.com', 'comeet.co', 'gem.com', 'dover.com', 'zohorecruit.com', 'zohorecruit.eu', 'manatal.com',
  'homerun.co', 'join.com', 'eightfold.ai', 'avature.net', 'beamery.com', 'tribepad.com', 'eploy.co.uk'
];

var JOB_DOMAINS = [
  'itviec.com', 'totaljobs.com', 'indeed.com', 'indeedemail.com', 'glassdoor.com', 'glassdoor.co.uk',
  'jobtoday.com', 'reed.co.uk', 'cv-library.co.uk', 'cwjobs.co.uk', 'jobsite.co.uk', 'monster.com',
  'monster.co.uk', 'ziprecruiter.com', 'adzuna.com', 'adzuna.co.uk', 'topcv.vn', 'vietnamworks.com',
  'careerviet.vn', 'careerbuilder.vn', 'topdev.vn', 'jobsgo.vn', 'wellfound.com', 'angel.co', 'otta.com',
  'welcometothejungle.com', 'hired.com', 'dice.com', 'jooble.org', 'talent.com', 'simplyhired.com',
  'builtin.com', 'weworkremotely.com', 'remoteok.com', 'milkround.com', 'gradcracker.com',
  'targetjobs.co.uk', 'brightnetwork.co.uk', 'prospects.ac.uk', 'guardianjobs.co.uk', 'technojobs.co.uk',
  'jobserve.com'
];

// LinkedIn sends both job alerts and real messages, so only these addresses count as job alerts.
var JOB_ADDRESSES = [
  'jobalerts-noreply@linkedin.com', 'jobs-listings@linkedin.com', 'jobs-noreply@linkedin.com', 'jobs@linkedin.com'
];

var MONEY_DOMAINS = [
  'paypal.com', 'paypal.co.uk', 'stripe.com', 'payoneer.com', 'wise.com', 'transferwise.com', 'revolut.com',
  'monzo.com', 'starlingbank.com', 'hsbc.co.uk', 'hsbc.com', 'barclays.co.uk', 'barclays.com',
  'lloydsbank.co.uk', 'natwest.com', 'santander.co.uk', 'halifax.co.uk', 'nationwide.co.uk', 'chase.co.uk',
  'klarna.com', 'clearpay.co.uk', 'americanexpress.com', 'vietcombank.com.vn', 'techcombank.com.vn',
  'tpb.vn', 'mbbank.com.vn', 'vpbank.com.vn', 'acb.com.vn', 'bidv.com.vn', 'vietinbank.vn', 'sacombank.com',
  'vib.com.vn', 'momo.vn', 'zalopay.vn', 'vnpay.vn'
];

var SHOP_DOMAINS = [
  'amazon.co.uk', 'amazon.com', 'amazon.de', 'amazon.fr', 'amazon.it', 'amazon.es', 'ebay.co.uk', 'ebay.com',
  'shopee.vn', 'lazada.vn', 'tiki.vn', 'sendo.vn', 'aliexpress.com', 'temu.com', 'shein.com', 'etsy.com',
  'asos.com', 'argos.co.uk', 'tesco.com', 'sainsburys.co.uk', 'ocado.com', 'deliveroo.co.uk', 'just-eat.co.uk',
  'royalmail.com', 'dpd.co.uk', 'evri.com', 'ups.com', 'fedex.com', 'dhl.com', 'dhl.co.uk', 'yodel.co.uk',
  'parcelforce.com', 'inpost.co.uk', 'ghn.vn', 'ghtk.vn', 'viettelpost.com.vn', 'vnpost.vn'
];

var GOOGLE_DOMAINS = ['google.com', 'withgoogle.com'];

// ---------------------------------------------------------------------------
// Patterns (tested against subject unless noted)
// ---------------------------------------------------------------------------

// A real person wrote to you through a platform (LinkedIn, Upwork, Indeed…).
var PLATFORM_MSG_RE = /(sent you (a )?(new )?message|new message from|you have (\d+ )?(new|unread) messages?|messaged you|replied to your (message|comment)|\binmail\b|đã gửi (cho bạn |bạn )?(một )?tin nhắn|tin nhắn mới|nhắn tin cho bạn)/i;
var SHARE_RE = /(shared (a |an )?(document|file|folder|spreadsheet|presentation|form|item|items)?\s*with you|has shared|invited you to (edit|view|comment|collaborate|join)|đã chia sẻ|mời bạn (chỉnh sửa|xem|tham gia))/i;
var VIA_GOOGLE_RE = /\(via Google (Drive|Docs|Sheets|Slides|Forms|Calendar|Chat)\)/i;
var INVITE_RE = /^\s*((updated )?(invitation|invite)|lời mời( đã cập nhật)?|accepted|declined|tentatively accepted|đã chấp nhận|đã từ chối)\s*[:：]/i;

var OTP_RE = /(\botp\b|one[- ]time (pass(word|code)?|code|pin|link)|verification (code|link|email|required)|verify (your |this )?(email|e-mail|account|identity|address|sign[- ]?in|log[- ]?in|device)|security code|confirmation code|log[- ]?in (code|link)|sign[- ]?in (code|link)|magic link|your (one[- ]time |login |access |temporary )?(code|pin|passcode)\b|\b2fa\b|two[- ]factor (code|authentication code)|reset (your )?password|password reset|forgot (your )?password|confirm (your )?(email|e-mail|account|address|sign[- ]?up|registration|subscription)|activate your account|account activation|mã (xác (minh|nhận|thực)|otp|kích hoạt|đăng nhập|bảo mật|truy cập)|xác (minh|nhận|thực) (email|địa chỉ email|tài khoản|đăng nhập)|đặt lại mật khẩu|quên mật khẩu)/i;
var OTP_CODE_SUBJECT_RE = /(\b\d{4,8}\b.{0,40}\b(code|otp|mã)\b|^\s*\d{4,8}\s*$)/i;
var OTP_SNIPPET_RE = /((verification|one[- ]time|\botp\b|passcode|log[- ]?in code|sign[- ]?in code|security code|mã xác (minh|nhận|thực)|mã otp|mã đăng nhập)[^.]{0,60}?\b\d{4,8}\b|\b\d{4,8}\b[^.]{0,40}?(is your|là mã))/i;

var SECURITY_RE = /((your )?account (has been |was )?created|tài khoản.{0,40}đã được tạo|requesting (updated |additional )?permissions|security (alert|notification|notice)|cảnh báo bảo mật|thông báo bảo mật|new (sign[- ]?in|login|log[- ]?in|device)|sign[- ]?in (attempt|from|on|detected)|log[- ]?in (attempt|from|detected|alert)|đăng nhập (mới|lạ|từ|trên)|thiết bị mới|password (was |has been )?(changed|updated|reset)\b|(đã )?(thay )?đổi mật khẩu|mật khẩu (của bạn )?đã (được )?(thay đổi|cập nhật)|suspicious|unusual (activity|sign|login)|hoạt động (đáng ngờ|bất thường)|account (locked|suspended|compromised|disabled|was accessed)|recovery (email|phone)|app password|2-step verification|xác minh 2 bước|critical security|someone (has|knows|tried)|has access to your|access was granted|third-party (oauth )?(app|application|access)|(app|application) (has been|was) (added|authorized)|(ssh key|access token|public key|passkey|security key) (was |has been )?(added|created)|shared (some )?(your )?google account data|account data with)/i;

var APPLY_STRONG_RE = /(thank(s| you) for (applying|your (application|interest in))|your application|application (received|update|status|for the)|received your application|your candidacy|(invite|invitation) (you )?to (an |a )?interview|interview (invitation|invite|request|availability|schedul|confirm)|schedule (an |a |your )?(interview|call|chat)|next steps? (in|for) |offer letter|job offer|regret to inform|not (be )?moving forward|decided (not )?to (move|proceed|pursue)|unfortunately,? we|hồ sơ (ứng tuyển|của bạn)|kết quả (ứng tuyển|phỏng vấn)|mời phỏng vấn|lịch phỏng vấn|thư mời (làm việc|phỏng vấn)|cảm ơn bạn đã ứng tuyển)/i;
// Hiring-process steps. Newsletters use these words too, so they only count without list headers.
var APPLY_PROCESS_RE = /(invitation to (take|complete|do)\b|(take on|complete) (a few|some|the|our) (tasks?|assessments?|tests?|exercises?)|screening (phase|stage|call|interview)|(made|making) it (through|to the next)|shortlisted|next (round|stage|phase) of|(online|technical|coding) (assessment|test|task|challenge|interview))/i;
var APPLY_WEAK_RE =/(interview|phỏng vấn|assessment|coding (test|challenge|exercise)|take[- ]home|next steps?|ứng tuyển|recruit(ing|ment) (team|process))/i;
// "You applied" confirmations from job boards are noise, not replies.
var JOB_CONFIRM_RE = /(application (was |has been )?(sent|submitted)|you applied|applied (to|for) |bạn đã ứng tuyển|đã nộp (hồ sơ|đơn))/i;

var JOB_ALERT_RE = /(\bnew jobs?\b|\bjobs? for you|\bmore jobs?\b|\bjob (alerts?|match|matches|recommendations?|openings?|opportunit)|\bjob at\b|\brole at\b|\bjobs? (near|in) |is hiring|are hiring|now hiring|actively recruiting|đang tuyển|tuyển dụng|việc làm|công việc (mới|phù hợp|gợi ý)|great fit|good fit|apply (now|early|today)|has an opportunity|opportunity for you|roles? (for|matching|that match) you|matching (jobs|roles)|recommended (jobs|roles)|jobs? you (may|might)|high[- ]paying jobs)/i;

var MONEY_RE = /(invoice|hóa đơn|receipt|biên (lai|nhận)|payment|thanh toán|transaction|giao dịch|biến động số dư|số dư|statement|sao kê|refund|hoàn tiền|\bcharged\b|billing|\bbill\b|renewal|gia hạn|top[- ]?up|nạp tiền|payout|deposit|withdraw|rút tiền|transfer (received|sent|completed)|chuyển (tiền|khoản)|direct debit|credit card|thẻ tín dụng|tax return)/i;

var SHOP_RE = /(your order|order (confirmed|confirmation|#|no\.?|number|shipped|update|placed|received|is on|has been|status)|đơn hàng|shipped|dispatched|out for delivery|delivered|đã giao|giao hàng|đang giao|vận chuyển|tracking (number|info|update)|\bpackage\b|\bparcel\b|kiện hàng|bưu kiện|delivery (update|scheduled|attempt|confirmed)|arriving (today|tomorrow)|return (label|request|received|started)|ready for (collection|pickup))/i;

// Sender address parts that only machines use.
var STRONG_LOCAL_RE = /(^|[-_.+])(no[-_.]?reply|do[-_.]?not[-_.]?reply|donotreply|notifications?|notify|notifier|alerts?|mailer[-_.]?daemon|bounces?|newsletters?|digest|robot|automated|postmaster)([-_.+0-9]|$)/i;
// Shared mailboxes: a person might write from these, so they only count with another sign.
var WEAK_LOCAL_RE = /^(info|hello|hi|hey|team|support|help|contact|billing|invoices?|receipts?|orders?|order[-_.]update|shipping|shipment|tracking|delivery|payments?|statements?|transactions?|sales|marketing|news|updates?|accounts?|security|verify|service|services|customerservice|customer[-_.]?care|care|admin|system|feedback|survey|community|members?|membership|store|shop|offers|deals|promo|rewards|welcome|careers|jobs|talent|recruiting|recruitment|hr)([-_.+0-9].*)?$/i;
var ESP_HEADERS = ['x-sg-eid', 'x-mailgun-sid', 'x-ses-outgoing', 'x-mc-user', 'x-campaign', 'x-campaignid',
  'x-marketoid', 'x-pm-message-id', 'x-csa-complaints', 'x-sfmc-stack'];
var ESP_MAILER_RE = /(mailchimp|sendgrid|hubspot|marketo|salesforce|exacttarget|braze|customer\.io|iterable|klaviyo|sendinblue|brevo|mailjet|mailerlite|convertkit|substack|postmark|amazon ses|campaign monitor|constant contact|zoho campaigns)/i;
var BULK_SNIPPET_RE = /(unsubscribe|hủy đăng ký|view (it |this email )?in (your |a )?browser|manage (your )?(email )?(preferences|notifications|subscriptions)|this is an automated|do not reply|vui lòng không trả lời)/i;

// Headers the sync asks Gmail for (metadata only, never the body).
var CLASSIFIER_HEADERS = ['From', 'Subject', 'Reply-To', 'List-Unsubscribe', 'List-Id', 'Precedence',
  'Auto-Submitted', 'Feedback-ID', 'X-Mailer', 'X-SG-EID', 'X-Mailgun-Sid', 'X-SES-Outgoing', 'X-MC-User',
  'X-Campaign', 'X-CampaignID', 'X-Marketoid', 'X-PM-Message-Id', 'X-CSA-Complaints', 'X-SFMC-Stack'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bundleByKey(key) {
  for (var i = 0; i < BUNDLES.length; i++) if (BUNDLES[i].key === key) return BUNDLES[i];
  return null;
}

function nfc_(s) {
  s = String(s || '');
  return s.normalize ? s.normalize('NFC') : s;
}

function decodeEntities_(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); })
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function parseFrom_(raw) {
  raw = nfc_(raw).trim();
  var m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  var name = m ? m[1].trim() : '';
  var email = (m ? m[2] : raw).trim().toLowerCase();
  var at = email.lastIndexOf('@');
  return {
    name: name || (at > 0 ? email.slice(0, at) : email),
    email: email,
    local: at > 0 ? email.slice(0, at) : email,
    domain: at > 0 ? email.slice(at + 1) : ''
  };
}

function domainIn_(domain, list) {
  if (!domain) return false;
  for (var i = 0; i < list.length; i++) {
    var d = list[i];
    if (domain === d || domain.slice(-(d.length + 1)) === '.' + d) return true;
  }
  return false;
}

/** Turns a Gmail API message (format=metadata) into the shape classify() needs. */
function normalizeMessage(meta) {
  var h = {};
  var headers = (meta.payload && meta.payload.headers) || [];
  for (var i = 0; i < headers.length; i++) h[String(headers[i].name).toLowerCase()] = String(headers[i].value || '');
  var from = parseFrom_(h['from'] || '');
  return {
    id: meta.id,
    threadId: meta.threadId,
    ts: Number(meta.internalDate) || 0,
    labelIds: meta.labelIds || [],
    headers: h,
    fromName: from.name,
    fromEmail: from.email,
    local: from.local,
    domain: from.domain,
    subject: nfc_(h['subject'] || ''),
    snippet: nfc_(decodeEntities_(meta.snippet || ''))
  };
}

/** Signs that a message was sent by a machine rather than typed by a person. */
function automationSignals(msg) {
  var h = msg.headers || {};
  var labels = msg.labelIds || [];
  var strong = [];
  var weak = [];
  if (h['list-unsubscribe'] || h['list-id']) strong.push('mailing list headers');
  if (/^(bulk|list|junk)$/i.test((h['precedence'] || '').trim())) strong.push('bulk precedence');
  if (h['auto-submitted'] && !/^no$/i.test(h['auto-submitted'].trim())) strong.push('auto-submitted');
  if (h['feedback-id']) strong.push('bulk sender id');
  for (var i = 0; i < ESP_HEADERS.length; i++) {
    if (h[ESP_HEADERS[i]]) { strong.push('email marketing service'); break; }
  }
  if (ESP_MAILER_RE.test(h['x-mailer'] || '')) strong.push('email marketing service');
  if (STRONG_LOCAL_RE.test(msg.local || '')) strong.push('no-reply address');
  if (labels.indexOf('CATEGORY_PROMOTIONS') >= 0) strong.push('Gmail: promotions');
  if (labels.indexOf('CATEGORY_SOCIAL') >= 0) strong.push('Gmail: social');
  if (labels.indexOf('CATEGORY_FORUMS') >= 0) strong.push('Gmail: forums');

  if (WEAK_LOCAL_RE.test(msg.local || '')) weak.push('shared mailbox address');
  if (labels.indexOf('CATEGORY_UPDATES') >= 0) weak.push('Gmail: updates');
  if (BULK_SNIPPET_RE.test(msg.snippet || '')) weak.push('unsubscribe text');

  return {
    automated: strong.length > 0 || weak.length >= 2,
    hasListHeaders: !!(h['list-unsubscribe'] || h['list-id']),
    strong: strong,
    weak: weak
  };
}

function matchRule_(msg, rules) {
  if (!rules || !rules.length) return null;
  var email = msg.fromEmail || '';
  var domain = msg.domain || '';
  var domainHit = null;
  for (var i = 0; i < rules.length; i++) {
    var p = String(rules[i].pattern || '').toLowerCase().trim();
    if (!p || !bundleByKey(rules[i].bundle)) continue;
    if (p.indexOf('@') > 0) {
      if (p === email) return rules[i]; // an exact address beats a domain rule
    } else {
      p = p.replace(/^@/, '');
      if (!domainHit && domainIn_(domain, [p])) domainHit = rules[i];
    }
  }
  return domainHit;
}

// ---------------------------------------------------------------------------
// The classifier
// ---------------------------------------------------------------------------

/**
 * Decides which group a message belongs to.
 * @param msg  result of normalizeMessage()
 * @param ctx  { rules: [{pattern, bundle}], inMyThread: bool, applyDomains: [domain] }
 * @return { bundle: key, why: short reason shown in the dashboard }
 *
 * When unsure, it leans towards "people": an extra mail in the inbox is
 * better than a missed message from a person.
 */
function classify(msg, ctx) {
  ctx = ctx || {};
  var subject = msg.subject || '';
  var snippet = msg.snippet || '';
  var domain = msg.domain || '';
  var sig = automationSignals(msg);
  var isAts = domainIn_(domain, ATS_DOMAINS);
  var isJobBoard = domainIn_(domain, JOB_DOMAINS) || JOB_ADDRESSES.indexOf(msg.fromEmail) >= 0;

  // 1. Your own rules (set from the dashboard or learned when you move a mail).
  var rule = matchRule_(msg, ctx.rules);
  if (rule) return { bundle: rule.bundle, why: 'Your rule: ' + rule.pattern };

  // 2. A person reached you through a service.
  if (PLATFORM_MSG_RE.test(subject)) return { bundle: 'people', why: 'Message sent through a platform' };
  if (VIA_GOOGLE_RE.test(msg.fromName || '') || SHARE_RE.test(subject)) return { bundle: 'people', why: 'Someone shared something with you' };
  if (INVITE_RE.test(subject)) return { bundle: 'people', why: 'Meeting invite or reply' };

  // 3. One-time codes.
  if (OTP_RE.test(subject) || OTP_CODE_SUBJECT_RE.test(subject)) return { bundle: 'codes', why: 'One-time code or verify link' };
  if (OTP_SNIPPET_RE.test(snippet) && sig.automated) return { bundle: 'codes', why: 'One-time code in the message' };

  // 4. Replies to your job applications.
  var boardConfirmation = isJobBoard && JOB_CONFIRM_RE.test(subject);
  if (!boardConfirmation) {
    if (APPLY_STRONG_RE.test(subject)) return { bundle: 'apply', why: 'Reply about your application' };
    if (isAts) return { bundle: 'apply', why: 'Sent by a hiring system' };
    if ((APPLY_PROCESS_RE.test(subject) || APPLY_PROCESS_RE.test(snippet)) && !sig.hasListHeaders && !isJobBoard) {
      return { bundle: 'apply', why: 'Next step in a hiring process' };
    }
    if (APPLY_STRONG_RE.test(snippet) && !sig.hasListHeaders && !isJobBoard) return { bundle: 'apply', why: 'Reply about your application' };
    if (APPLY_WEAK_RE.test(subject) && !sig.automated) return { bundle: 'apply', why: 'Hiring conversation' };
  }

  // 5. Account security.
  if (SECURITY_RE.test(subject)) return { bundle: 'security', why: 'Security notice' };

  // 5b. A company that already answered one of your applications.
  if (!isJobBoard && domainIn_(domain, ctx.applyDomains || [])) {
    return { bundle: 'apply', why: 'Company you applied to' };
  }

  // 6. A thread you replied to is a conversation.
  if (ctx.inMyThread && !sig.hasListHeaders) return { bundle: 'people', why: 'Conversation you replied to' };

  // 7. Job boards (their real messages were already caught in step 2).
  if (isJobBoard) return { bundle: 'jobs', why: 'Job board' };

  // Shops and banks often send receipts without bulk-mail headers. Only trust the
  // domain when the subject or the sender box looks transactional, so a recruiter
  // writing from amazon.com still lands in People.
  var serviceBox = STRONG_LOCAL_RE.test(msg.local || '') || WEAK_LOCAL_RE.test(msg.local || '');
  if (domainIn_(domain, MONEY_DOMAINS) && (MONEY_RE.test(subject) || serviceBox)) return { bundle: 'money', why: 'Bank or payment service' };
  if (domainIn_(domain, SHOP_DOMAINS) && (SHOP_RE.test(subject) || serviceBox)) return { bundle: 'shopping', why: 'Shop or courier' };

  // 8. No machine signs at all: treat it as written by a person.
  if (!sig.automated) return { bundle: 'people', why: 'No bulk-mail signs' };

  var auto = 'automated: ' + sig.strong.concat(sig.weak).slice(0, 2).join(', ');

  // 9. Automated mail, sorted by type.
  if (JOB_ALERT_RE.test(subject + ' ' + (msg.fromName || ''))) return { bundle: 'jobs', why: 'Job alert' };
  if (MONEY_RE.test(subject) || domainIn_(domain, MONEY_DOMAINS)) return { bundle: 'money', why: 'Bill, receipt or payment' };
  if (SHOP_RE.test(subject) || domainIn_(domain, SHOP_DOMAINS)) return { bundle: 'shopping', why: 'Order or delivery' };
  if (domainIn_(domain, GOOGLE_DOMAINS)) return { bundle: 'google', why: 'Google notification' };
  return { bundle: 'updates', why: auto.charAt(0).toUpperCase() + auto.slice(1) };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    BUNDLES: BUNDLES, CLASSIFIER_HEADERS: CLASSIFIER_HEADERS, bundleByKey: bundleByKey, PERSONAL_DOMAINS: PERSONAL_DOMAINS,
    JOB_DOMAINS: JOB_DOMAINS,
    normalizeMessage: normalizeMessage, automationSignals: automationSignals, classify: classify,
    parseFrom_: parseFrom_, decodeEntities_: decodeEntities_
  };
}
