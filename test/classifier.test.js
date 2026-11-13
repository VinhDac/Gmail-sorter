// Run: node test/classifier.test.js
// Loads apps-script/Classifier.gs as plain JS and checks it against sample mail.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Classifier.gs'), 'utf8');
const sandbox = { module: { exports: {} } };
vm.runInNewContext(src, sandbox);
const C = sandbox.module.exports;

const LIST = { 'List-Unsubscribe': '<mailto:unsub@example.com>' };

function mk(from, subject, opts = {}) {
  const headers = Object.assign({ From: from, Subject: subject }, opts.headers || {});
  return C.normalizeMessage({
    id: 'x', threadId: 't', internalDate: '1731400000000',
    labelIds: opts.labels || ['INBOX', 'UNREAD'],
    snippet: opts.snippet || '',
    payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) }
  });
}

const cases = [
  // From the inbox screenshot
  ['apply', mk('Nevis Wealth Hiring <no-reply@ashbyhq.com>', 'Thank you for applying to Nevis', { snippet: 'Hi Dac, Thanks a lot for applying for the Applied AI Engineer role' })],
  ['jobs', mk('ITviec Job Robot <jobrobot@itviec.com>', 'Senior Data Scientist and 1 more job for you', { headers: LIST })],
  ['jobs', mk('ITviec Job Robot <jobrobot@itviec.com>', 'Data Scientist - AGI Project and 4 more jobs for you')],
  ['jobs', mk('Job alerts from Google <notify-noreply@google.com>', "6 new jobs for 'junior machine learning job' - 8 Nov")],
  ['jobs', mk('Totaljobs <jobalerts@totaljobs.com>', 'We found 10 new job matches for you', { headers: LIST })],
  ['jobs', mk('Indeed <alert@indeed.com>', 'AI Developer @ Emerging Technology Ltd', { snippet: 'Hi DAC, Your background as an AI engineer and your proficiency in Python' })],
  ['jobs', mk('Sophie from Vaia <sophie@vaia.com>', 'Hair and Beauty Lecturer at Morgan Hunt UK Ltd: £20k - £30k (est.) and more high-paying jobs', { headers: LIST })],
  ['jobs', mk('LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>', 'Graduate data scientist job at Northwind Labs - Actively recruiting')],
  ['jobs', mk('Job Today <hello@jobtoday.com>', 'Job Alert ✅', { headers: LIST })],
  ['money', mk('Cloudflare <noreply@notify.cloudflare.com>', "Your invoice is available (alex.doe@gmail[.]com's Account)")],
  ['jobs', mk('Glassdoor Jobs <noreply@glassdoor.com>', 'AI Engineer role at Aviva: you would be a great fit!')],
  ['jobs', mk('Glassdoor Jobs <noreply@glassdoor.com>', 'drcom has an opportunity for you. Apply Now.')],
  ['google', mk('Google AdSense <adsense-noreply@google.com>', 'Việc cần làm: Đơn đăng ký AdSense của bạn')],
  ['google', mk('Google Search Console <sc-noreply@google.com>', 'Theo dõi lưu lượng truy cập từ Google Tìm kiếm đến craftsimulation.com')],
  ['updates', mk('Bizfly Cloud <newsletter@bizflycloud.vn>', '[Tin tức Security] OpenAI công bố ba sự cố mới', { headers: LIST })],
  ['shopping', mk('Amazon Shipping UK <shipment-tracking@amazon.co.uk>', 'Your Protein Works package was delivered')],

  // From the second screenshot (12 Nov)
  ['jobs', mk('No Reply-Next Career <no-reply@nextcareer.co.uk>', "NEW Job Alert! Don't miss out.", { snippet: 'Hi Alex, We have some new opportunities that might interest you.' })],
  ['updates', mk('Promptly AI <hello@promptly.example>', "Alex, there's a new project waiting for you", { headers: LIST })],
  ['money', mk('Barclays <news@email.barclays.co.uk>', 'Mr Doe, your Online Bonus Saver interest rate has increased', { headers: LIST })],
  ['security', mk('Google <no-reply@accounts.google.com>', 'You shared some Google Account data with accountstore.example')],
  ['security', mk('Account Store <no-reply@accountstore.example>', 'Tài khoản của bạn tại Account Store đã được tạo')],
  ['security', mk('GitHub <noreply@github.com>', '[GitHub] Claude is requesting updated permissions')],
  ['security', mk('Notion <notify@mail.notion.so>', 'Your account has been created')],
  ['codes', mk('Northwind Labs <no-reply@northwindlabs.com>', 'Alex Doe & Northwind Labs—Login code', { snippet: 'Please use the following code to access your application page: 19534526' })],
  ['apply', mk('Northwind Labs <no-reply@northwindlabs.com>', 'Alex Doe & Northwind Labs—Invitation to take on a few tasks', { snippet: "Hi Alex, Congratulations on making it through the screening phase! We're excited" })],
  ['apply', mk('Northwind Labs <no-reply@northwindlabs.com>', 'Update from Northwind Labs', { headers: LIST }), { applyDomains: ['northwindlabs.com'] }],
  ['codes', mk('Northwind Labs <no-reply@northwindlabs.com>', 'Login code'), { applyDomains: ['northwindlabs.com'] }],
  ['jobs', mk('LinkedIn <jobs-noreply@linkedin.com>', "Alex, apply now to 'Junior Pricing Data Scientist at Contoso'")],
  ['jobs', mk('LinkedIn Job Alerts <jobalerts-noreply@linkedin.com>', 'VirtueTech Recruitment Group Data Analyst and 39 other jobs you may be interested in')],
  ['jobs', mk('Job Today <hello@jobtoday.com>', 'Ravello Coffee Co. Ltd just posted a new job looking for Barista plus 35 other similar jobs', { headers: LIST })],
  ['updates', mk('Medium <noreply@medium.com>', 'Top 10 coding interview questions for ML engineers', { headers: LIST })],

  // People must never be lost
  ['people', mk('Recruiter <jane@amazon.com>', 'Opportunity at Amazon')],
  ['people', mk('Sam Lee <sam.lee@gmail.com>', 'Cuối tuần đi cafe không?', { labels: ['INBOX', 'CATEGORY_PERSONAL'] })],
  ['people', mk('Sarah Lee <sarah@acme.ai>', 'Quick chat about the ML Engineer role?')],
  ['apply', mk('Sarah Lee <sarah@acme.ai>', 'Interview availability next week')],
  ['people', mk('Anna Smith <anna@google.com>', 'Opportunity at Google DeepMind')],
  ['people', mk('Jane Doe via LinkedIn <messages-noreply@linkedin.com>', 'Jane just sent you a new message', { headers: LIST })],
  ['people', mk('Sam (via Google Drive) <drive-shares-dm-noreply@google.com>', "Document shared with you: 'CV final'")],
  ['people', mk('Recruiter <recruiter@acme.ai>', 'Invitation: Interview @ Mon 10 Nov 2026 10am')],
  ['people', mk('Upwork <donotreply@upwork.com>', 'You have unread messages about the job Python scraper')],
  ['people', mk('Small Biz <info@smallbiz.co.uk>', 'Question about your website', { labels: ['INBOX', 'CATEGORY_PERSONAL'] })],
  ['people', mk('Support <support@acme.io>', 'Re: my account', { labels: ['INBOX', 'CATEGORY_UPDATES'] }), { inMyThread: true }],

  // Codes, security
  ['codes', mk('Binance <do-not-reply@ses.binance.com>', '[Binance] Verification Code')],
  ['codes', mk('Instagram <security@mail.instagram.com>', '123456 is your Instagram code')],
  ['codes', mk('VCB Digibank <vcbdigibank@info.vietcombank.com.vn>', 'Mã OTP giao dịch')],
  ['codes', mk('Notion <notify@mail.notion.so>', 'Your login code', { snippet: 'Your login code is 482913' })],
  ['codes', mk('Acme <no-reply@acme.com>', 'Password reset request')],
  ['codes', mk('Slack <no-reply@slack.com>', 'Slack confirmation code: ABC-123', { snippet: 'Your confirmation code' })],
  ['security', mk('Google <no-reply@accounts.google.com>', 'Security alert')],
  ['security', mk('Google <no-reply@accounts.google.com>', 'Cảnh báo bảo mật')],
  ['security', mk('GitHub <noreply@github.com>', '[GitHub] A third-party OAuth application has been added to your account')],
  ['security', mk('Acme <no-reply@acme.com>', 'Your password was changed')],

  // Job board confirmations vs replies
  ['jobs', mk('LinkedIn <jobs-noreply@linkedin.com>', 'Alex, your application was sent to Northwind Labs')],
  ['apply', mk('LinkedIn <jobs-noreply@linkedin.com>', 'Your application was viewed by Northwind Labs')],
  ['apply', mk('Acme Careers <careers@acme.com>', 'Your application for Machine Learning Engineer')],

  // Newsletters and promos
  ['updates', mk('Medium Daily Digest <noreply@medium.com>', 'Interview with a staff ML engineer', { headers: LIST })],
  ['updates', mk('Uniqlo <news@uniqlo.com>', 'Black Friday deals start now', { labels: ['INBOX', 'CATEGORY_PROMOTIONS'] })],
  ['money', mk('PayPal <service@paypal.co.uk>', 'You sent a payment')],
  ['google', mk('Google Calendar <calendar-notification@google.com>', 'Notification: Gym @ Wed 12 Nov 2026 7am')],

  // Rules win
  ['updates', mk('Sam Lee <sam.lee@gmail.com>', 'hello'), { rules: [{ pattern: 'sam.lee@gmail.com', bundle: 'updates' }] }],
  ['jobs', mk('Bot <bot@sub.example.com>', 'hello', { headers: LIST }), { rules: [{ pattern: 'example.com', bundle: 'jobs' }] }],
];

let fail = 0;
for (const [want, msg, ctx] of cases) {
  const got = C.classify(msg, ctx || {});
  const ok = got.bundle === want;
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${want.padEnd(8)} got ${got.bundle.padEnd(8)} | ${msg.fromEmail.padEnd(42)} | ${msg.subject.slice(0, 50)}  (${got.why})`);
}
console.log(`\n${cases.length - fail}/${cases.length} passed`);
process.exit(fail ? 1 : 0);
