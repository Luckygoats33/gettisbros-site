/**
 * Gettis Bros — website form endpoint
 * ---------------------------------------------------------------------------
 * Replaces FormSubmit. Sends a branded HTML email from the deploying Gmail
 * account, with Reply-To set to the person who submitted the form so hitting
 * Reply answers the lead directly.
 *
 * DEPLOY
 *   1. script.google.com -> New project -> paste this file over Code.gs
 *   2. Deploy -> New deployment -> type "Web app"
 *        Execute as:      Me
 *        Who has access:  Anyone
 *   3. Authorize when prompted (it needs permission to send mail as you)
 *   4. Copy the /exec URL and hand it back to be wired into the site
 *
 * To change recipients later, edit CONFIG and redeploy
 * (Deploy -> Manage deployments -> edit -> Version: New version).
 */

var CONFIG = {
  TO: 'will@supportwellnessglobal.com',
  CC: 'gettisbros@gmail.com',
  FROM_NAME: 'Gettis Bros Website',
  SITE: 'https://gettisbros.com',
  LOGO: 'https://gettisbros.com/images/logo-white.png',
  PHONE: '(971) 304-1012',
  PHONE_HREF: '+19713041012',
  GOLD: '#E8A924',
  INK: '#111111',
};

// Field keys that are plumbing, not lead data — never rendered in the email.
var META_FIELDS = ['_subject', '_template', '_cc', '_honey', '_replyto', '_next', '_captcha'];

// Pretty labels for known fields; anything else is title-cased automatically.
var LABELS = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  service: 'Service Needed',
  timeline: 'Timeline',
  message: 'Project Details',
  your_name: 'Referrer Name',
  your_phone: 'Referrer Phone',
  your_email: 'Referrer Email',
  friend_name: 'Referred Friend',
  friend_phone: "Friend's Phone",
  project_details: 'Project Details',
};

// A consumer Gmail account allows ~100 recipients/day and each lead uses 2
// (To + CC). A spam flood would burn the quota and silently drop real leads,
// so cap sends per hour and per day. Bots get a success response either way —
// telling them they were blocked just invites retries.
var LIMITS = { PER_HOUR: 12, PER_DAY: 40 };

function underQuota() {
  var props = PropertiesService.getScriptProperties();
  var now = new Date();
  var hourKey = 'h_' + Utilities.formatDate(now, 'UTC', 'yyyyMMddHH');
  var dayKey = 'd_' + Utilities.formatDate(now, 'UTC', 'yyyyMMdd');

  var hour = Number(props.getProperty(hourKey) || 0);
  var day = Number(props.getProperty(dayKey) || 0);
  if (hour >= LIMITS.PER_HOUR || day >= LIMITS.PER_DAY) return false;

  props.setProperty(hourKey, String(hour + 1));
  props.setProperty(dayKey, String(day + 1));
  return true;
}

function doPost(e) {
  try {
    var p = (e && e.parameter) || {};

    // Honeypot: a bot filled the hidden field. Accept silently, send nothing.
    if (p._honey) return json({ success: 'true', message: 'ok' });

    // Rate limit before doing any work, so a flood cannot exhaust the mail quota.
    if (!underQuota()) {
      console.warn('Rate limit hit — submission not emailed: ' + JSON.stringify(p).slice(0, 300));
      return json({ success: 'true', message: 'ok' });
    }

    var replyTo = p._replyto || p.email || p.your_email || '';
    var subject = p._subject || 'New Website Enquiry - Gettis Bros';

    var rows = [];
    for (var key in p) {
      if (META_FIELDS.indexOf(key) !== -1) continue;
      var val = String(p[key] || '').trim();
      if (!val) continue;
      rows.push({ label: LABELS[key] || titleCase(key), value: val, key: key });
    }
    if (!rows.length) return json({ success: 'false', message: 'empty submission' });

    var options = {
      htmlBody: buildEmail(rows, subject),
      name: CONFIG.FROM_NAME,
    };
    if (CONFIG.CC) options.cc = CONFIG.CC;
    if (isEmail(replyTo)) options.replyTo = replyTo;

    MailApp.sendEmail(CONFIG.TO, subject, plainText(rows), options);

    return json({ success: 'true', message: 'The form was submitted successfully.' });
  } catch (err) {
    return json({ success: 'false', message: String(err) });
  }
}

// Browsers may probe the URL; make a GET harmless and obvious.
function doGet() {
  return json({ success: 'false', message: 'This endpoint accepts POST submissions only.' });
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function isEmail(s) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || ''));
}

function titleCase(k) {
  return String(k).replace(/[_-]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function stamp() {
  return Utilities.formatDate(new Date(), 'America/Los_Angeles', "EEEE, MMMM d, yyyy 'at' h:mm a") + ' PT';
}

function plainText(rows) {
  var out = [];
  for (var i = 0; i < rows.length; i++) out.push(rows[i].label + ': ' + rows[i].value);
  out.push('', 'Submitted ' + stamp(), CONFIG.SITE);
  return out.join('\n');
}

function buildEmail(rows, subject) {
  var G = CONFIG.GOLD, INK = CONFIG.INK;

  // Pull contact details out for the reply bar at the top.
  var lead = {};
  for (var i = 0; i < rows.length; i++) {
    var k = rows[i].key;
    if (k === 'name' || k === 'your_name') lead.name = lead.name || rows[i].value;
    if (k === 'email' || k === 'your_email') lead.email = lead.email || rows[i].value;
    if (k === 'phone' || k === 'your_phone') lead.phone = lead.phone || rows[i].value;
  }

  var cells = '';
  for (var j = 0; j < rows.length; j++) {
    var r = rows[j];
    var v = esc(r.value).replace(/\n/g, '<br>');
    if (r.key === 'email' || r.key === 'your_email') v = '<a href="mailto:' + esc(r.value) + '" style="color:#8A6100;text-decoration:underline;">' + v + '</a>';
    if (/phone/.test(r.key)) v = '<a href="tel:' + esc(r.value.replace(/[^0-9+]/g, '')) + '" style="color:#8A6100;text-decoration:underline;">' + v + '</a>';
    cells +=
      '<tr>' +
        '<td style="padding:14px 20px;border-bottom:1px solid #EEEEEE;font:600 12px/1.4 Arial,Helvetica,sans-serif;color:#777777;text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;vertical-align:top;width:38%;">' + esc(r.label) + '</td>' +
        '<td style="padding:14px 20px;border-bottom:1px solid #EEEEEE;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:#111111;vertical-align:top;">' + v + '</td>' +
      '</tr>';
  }

  var replyBar = '';
  if (lead.email || lead.phone) {
    var bits = [];
    if (lead.email) bits.push('<a href="mailto:' + esc(lead.email) + '" style="display:inline-block;background:' + G + ';color:#111111;font:700 13px/1 Arial,Helvetica,sans-serif;text-decoration:none;padding:13px 22px;border-radius:4px;">Reply to ' + esc((lead.name || 'this lead').split(' ')[0]) + '</a>');
    if (lead.phone) bits.push('<a href="tel:' + esc(lead.phone.replace(/[^0-9+]/g, '')) + '" style="display:inline-block;background:#FFFFFF;color:#111111;border:1px solid #CCCCCC;font:700 13px/1 Arial,Helvetica,sans-serif;text-decoration:none;padding:12px 22px;border-radius:4px;">Call ' + esc(lead.phone) + '</a>');
    replyBar =
      '<tr><td style="padding:22px 20px 4px;">' +
        bits.join('&nbsp;&nbsp;') +
      '</td></tr>';
  }

  return '' +
'<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>' + esc(subject) + '</title></head>' +
'<body style="margin:0;padding:0;background:#F4F4F2;">' +
'<span style="display:none;font-size:1px;color:#F4F4F2;">' + esc((lead.name || 'New enquiry')) + (lead.phone ? ' - ' + esc(lead.phone) : '') + '</span>' +
'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F2;padding:28px 12px;">' +
  '<tr><td align="center">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:6px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">' +

      // Brand header
      '<tr><td style="background:' + INK + ';padding:26px 20px;text-align:center;">' +
        '<img src="' + CONFIG.LOGO + '" width="104" alt="Gettis Bros" style="display:block;margin:0 auto 12px;width:104px;height:auto;border:0;">' +
        '<div style="font:700 12px/1 Arial,Helvetica,sans-serif;color:' + G + ';letter-spacing:2.4px;text-transform:uppercase;">New Website Enquiry</div>' +
      '</td></tr>' +

      // Gold rule
      '<tr><td style="height:4px;background:' + G + ';font-size:0;line-height:0;">&nbsp;</td></tr>' +

      replyBar +

      // Field table
      '<tr><td style="padding:18px 0 0;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + cells + '</table>' +
      '</td></tr>' +

      // Footer
      '<tr><td style="padding:20px;background:#FAFAF8;">' +
        '<div style="font:400 12px/1.6 Arial,Helvetica,sans-serif;color:#888888;">' +
          'Submitted ' + esc(stamp()) + '<br>' +
          'via <a href="' + CONFIG.SITE + '" style="color:#8A6100;text-decoration:none;">gettisbros.com</a> &nbsp;&bull;&nbsp; ' +
          '<a href="tel:' + CONFIG.PHONE_HREF + '" style="color:#8A6100;text-decoration:none;">' + CONFIG.PHONE + '</a>' +
        '</div>' +
      '</td></tr>' +

    '</table>' +
    '<div style="font:400 11px/1.6 Arial,Helvetica,sans-serif;color:#AAAAAA;padding:14px 0 0;">Gettis Bros Asphalt &amp; Construction &bull; Lincoln County, Oregon</div>' +
  '</td></tr>' +
'</table></body></html>';
}
