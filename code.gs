/* ==================== TEEKEET STORE - API SERVER ==================== */

/* ========== CONFIG ========== */
const CONFIG = {
  TRACKER_SHEET: 'Ticket Tracker',
  REDEMPTION_SHEET: 'Redemption Tracker',
  COUPONS_SHEET: 'Coupons',
  OVERVIEW_SHEET: 'Balance Overview',
  USER_PROFILES_SHEET: 'User Profiles',
  OCR_SHEET: 'Sheet4',
  REFERRALS_SHEET: 'Referrals',
  FEEDBACK_SHEET: 'Feedback',
  DRIVE_FOLDER_PROP: 'DRIVE_FOLDER_ID',
  VISION_KEY_PROP: 'VISION_API_KEY',
  FIREBASE_KEY_PROP: 'FIREBASE_API_KEY', // Ensure this Script Property is set!
  REFEREE_BONUS_POINTS: 25,
  REFERRER_BONUS_POINTS: 50
};

/* ========== API HANDLER (DO NOT MODIFY) ========== */
function doGet(e) {
  return ContentService.createTextOutput("Teekeet Store API is Online. Use POST requests.");
}

function doPost(e) {
  // CORS: We return text/plain to avoid preflight OPTION requests from browser
  // The frontend must send 'text/plain' or 'application/x-www-form-urlencoded'
  
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const data = request.data || {};
    const idToken = request.idToken; // Firebase Auth Token passed from client
    
    let result = { success: false, message: "Invalid Action" };

    // Public Endpoints
    if (action === 'getAllCoupons') {
      result = getAllCoupons();
    }
    else if (action === 'getFirebaseConfig') {
       result = getFirebaseConfig();
    }
    // Secure Endpoints (Require Token)
    else {
      if (!idToken) throw new Error("Missing Auth Token");
      
      // We pass the token to the specific functions, they will verify it inside
      switch(action) {
        case 'getUserDataSecure':
          result = getUserDataSecure(idToken);
          break;
        case 'uploadTicketSecure':
          result = uploadTicketSecure(idToken, data);
          break;
        case 'requestRedemptionSecure':
          result = requestRedemptionSecure(idToken, data.couponId);
          break;
        case 'saveUserProfileSecure':
          result = saveUserProfileSecure(idToken, data);
          break;
        case 'getUserProfileSecure':
          result = getUserProfileSecure(idToken);
          break;
        case 'submitFeedbackSecure':
          result = submitFeedbackSecure(idToken, data.rating, data.message, data.category);
          break;
        case 'getPreviousUploadsSecure':
          result = getPreviousUploadsSecure(idToken);
          break;
        default:
          throw new Error("Unknown Action: " + action);
      }
    }
    
    // Wrap result in success structure if not already
    // Note: Some existing functions return {success: true...} others return raw data
    // We standardize for the API response
    return responseJSON(result);
    
  } catch (error) {
    return responseJSON({ success: false, error: error.toString() });
  }
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ========== ORIGINAL LOGIC PRESERVED BELOW ========== */
/* Copied and adapted from your original file */

// ... [Column Mappings Constants from original code] ...
const COL = {
  TICKET_ID: 1, TIMESTAMP: 2, EMAIL: 3, NAME: 4, PHONE: 5, INSTAGRAM: 6, URL: 7, TRAVEL_DATE: 8,
  POINTS_EARNED: 9, TOTAL_POINTS: 10, STATUS: 11, LAST_REDEMPTION: 12, BALANCE_POINTS: 13, PNR: 14,
  DUPLICATE_CHECK: 15, VALIDATION_STATUS: 16, EXPIRED: 17, NOTES: 18, OCR_STATUS: 19
};
const RED = {
  REDEMPTION_ID: 1, REDEMPTION_EMAIL: 2, COUPON_ID: 3, POINTS_REDEEMED: 4, REDEEM_DATE: 5, CHECK_BALANCE: 6, NOTES: 7
};
const CP = {
  COUPON_ID: 1, STORE: 2, CATEGORY: 9, LONG_OFFER: 4, TITLE: 5, DESCRIPTION: 6, CODE: 7, TERMS: 8,
  IMAGE_URL: 14, SMARTLINK: 13, BRAND_LOGO: 14, POINTS: 17, ACTIVE: 21
};

// --- DATA FETCHING ---

function getUserData(email) {
  try {
    if (!email) return { email: '', balance: 0, uploads: [], history: [], coupons: [], referralCode: '', referralBonus: 0 };
    email = String(email).toLowerCase().trim();
    
    const trackerData = getSheetDataValues(CONFIG.TRACKER_SHEET);
    const redemptionData = getSheetDataValues(CONFIG.REDEMPTION_SHEET);
    const referralsData = getSheetDataValues(CONFIG.REFERRALS_SHEET);
    
    const referralInfo = getReferralInfoFromData(referralsData, email);
    if (!referralInfo.code) {
      referralInfo.code = createReferralEntry(email); 
    }

    const credited = calculateCreditedPoints(trackerData, email);
    const redeemed = calculateRedeemedPoints(redemptionData, email);
    const balance = Math.max(0, (credited - redeemed) + referralInfo.bonus);

    const uploads = filterUploadsFromData(trackerData, email);
    const history = generateHistoryFromData(trackerData, redemptionData, email);
    const coupons = getAllCoupons();

    return {
      email: email,
      balance: Number(balance || 0),
      uploads: uploads,
      history: history,
      coupons: coupons,
      referralCode: referralInfo.code,
      referralBonus: referralInfo.bonus
    };
  } catch (e) {
    return { email: email || '', error: e.toString() };
  }
}

function getSheetDataValues(sheetName) {
  const sheet = ss().getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
}

function getReferralInfoFromData(data, email) {
  for (let i = 0; i < data.length; i++) {
    const rowEmail = (data[i][0] || '').toString().toLowerCase().trim();
    if (rowEmail === email) {
      return { code: data[i][1], bonus: Number(data[i][5] || 0) };
    }
  }
  return { code: null, bonus: 0 };
}

function calculateCreditedPoints(rows, email) {
  return rows.reduce((sum, r) => {
    if (!r[COL.EMAIL - 1]) return sum;
    const rEmail = (r[COL.EMAIL - 1]).toString().toLowerCase().trim();
    const duplicate = (r[COL.DUPLICATE_CHECK - 1] || '').toString().trim();
    const expired = (r[COL.EXPIRED - 1] || '').toString().trim();
    const status = (r[COL.STATUS - 1] || '').toString().trim();
    const points = Number(r[COL.POINTS_EARNED - 1] || 0);
    
    if (rEmail === email && duplicate.toLowerCase() !== 'duplicate' && expired.toLowerCase() !== 'expired' && status.toLowerCase() === 'credited') {
      return sum + points;
    }
    return sum;
  }, 0);
}

function calculateRedeemedPoints(rows, email) {
  return rows.reduce((sum, r) => {
    if (!r[RED.REDEMPTION_EMAIL - 1]) return sum;
    const rEmail = (r[RED.REDEMPTION_EMAIL - 1]).toString().toLowerCase().trim();
    const pts = Number(r[RED.POINTS_REDEEMED - 1] || 0);
    if (rEmail === email) return sum + pts;
    return sum;
  }, 0);
}

function filterUploadsFromData(rows, email) {
  const uploads = [];
  rows.forEach((r) => {
    if (!r[COL.EMAIL - 1]) return;
    const rEmail = (r[COL.EMAIL - 1]).toString().toLowerCase().trim();
    if (rEmail === email) {
      uploads.push({
        uploadedAt: r[COL.TIMESTAMP - 1] ? r[COL.TIMESTAMP - 1].toString() : '',
        photo: r[COL.URL - 1] || '', 
        travelDate: r[COL.TRAVEL_DATE - 1] ? r[COL.TRAVEL_DATE - 1].toString() : '',
        points: Number(r[COL.POINTS_EARNED - 1] || 0),
        status: r[COL.STATUS - 1] || 'Pending',
        validation: r[COL.VALIDATION_STATUS - 1] || '',
        pnr: r[COL.PNR - 1] || ''
      });
    }
  });
  return uploads.reverse();
}

function generateHistoryFromData(trackerRows, redemptionRows, email) {
  const history = [];
  trackerRows.forEach(r => {
    if (!r[COL.EMAIL - 1]) return;
    const rEmail = (r[COL.EMAIL - 1]).toString().toLowerCase().trim();
    if (rEmail !== email) return;
    const duplicate = (r[COL.DUPLICATE_CHECK - 1] || '').toString().trim();
    const expired = (r[COL.EXPIRED - 1] || '').toString().trim();
    const status = (r[COL.STATUS - 1] || '').toString().trim();
    if (duplicate.toLowerCase() !== 'duplicate' && expired.toLowerCase() !== 'expired' && status.toLowerCase() === 'credited') {
      history.push({ date: r[COL.TIMESTAMP - 1] || '', type: 'credit', points: Number(r[COL.POINTS_EARNED - 1] || 0), desc: 'Ticket credited' });
    }
  });
  redemptionRows.forEach(r => {
    if (!r[RED.REDEMPTION_EMAIL - 1]) return;
    const rEmail = (r[RED.REDEMPTION_EMAIL - 1]).toString().toLowerCase().trim();
    if (rEmail !== email) return;
    history.push({ date: r[RED.REDEEM_DATE - 1] || '', type: 'redeem', points: Number(r[RED.POINTS_REDEEMED - 1] || 0), desc: 'Coupon redeemed' });
  });
  history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return history;
}

function getAllCoupons() {
  const cache = CacheService.getScriptCache();
  const cachedData = cache.get('ALL_COUPONS_JSON');
  if (cachedData) return shuffleArray(JSON.parse(cachedData));
  
  const sheet = couponsSheet();
  if (!sheet) return [];
  
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  
  const coupons = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const isActive = String(row[20]).toUpperCase() === 'TRUE';
    if (!isActive) continue;
    coupons.push({
      id: Number(row[CP.COUPON_ID - 1]) || (i + 1),
      store: row[CP.STORE - 1] || '',
      category: row[8] || '', 
      longOffer: row[CP.LONG_OFFER - 1] || '',
      title: row[CP.TITLE - 1] || '',
      description: row[CP.DESCRIPTION - 1] || '',
      code: row[CP.CODE - 1] || '',
      terms: row[CP.TERMS - 1] || '',
      image: row[CP.IMAGE_URL - 1] || '',
      brandLogo: row[13] || '', 
      smartlink: row[CP.SMARTLINK - 1] || '',
      points: Number(row[CP.POINTS - 1] || 0)
    });
  }
  try { cache.put('ALL_COUPONS_JSON', JSON.stringify(coupons), 1200); } catch(e) { Logger.log('Cache put failed'); }
  return shuffleArray(coupons);
}

// --- WRITE OPS ---

function getUserDataSecure(idToken) {
  const verification = verifyFirebaseToken(idToken);
  return verification.success ? getUserData(verification.email) : { error: 'Auth failed' };
}

function uploadTicketSecure(idToken, data) {
  const v = verifyFirebaseToken(idToken);
  if (!v.success) return { success: false, message: 'Auth failed' };
  
  try {
    const email = v.email;
    if (!email || !data.base64) throw 'Missing data';

    const match = data.base64.match(/^data:(image\/.+);base64,(.*)$/);
    if (!match) throw 'Invalid image data';
    const blob = Utilities.newBlob(Utilities.base64Decode(match[2]), match[1], data.fileName);

    const folderId = PropertiesService.getScriptProperties().getProperty(CONFIG.DRIVE_FOLDER_PROP);
    let file;
    if (folderId) {
      try {
        file = DriveApp.getFolderById(folderId).createFile(blob);
      } catch(e) {
        file = DriveApp.createFile(blob); // Fallback to root
      }
    } else {
      file = DriveApp.createFile(blob);
    }
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const sheet = trackerSheet();
    const notes = data.referrerCode ? 'REF:' + data.referrerCode : '';
    // Append row. Note: Columns matched to original structure
    sheet.appendRow(['', new Date(), email, data.name||'', data.phone||'', data.instagram||'', file.getUrl(), '', 0, '', 'Pending Review', '', '', '', '', '', '', notes, '']);
    
    sendEmailSafe(email, 'Teekeet Store - Ticket Received', 'Hi,\n\nWe received your ticket. We will review it within 24-48 hours.\n\nTeam Teekeet Store');
    return { success: true, message: 'Ticket uploaded successfully!' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function requestRedemptionSecure(idToken, couponId) {
  const user = getUserDataSecure(idToken);
  if (!user || user.error) return { success: false, message: 'Auth failed' };
  
  const coupon = user.coupons.find(c => c.id == couponId);
  if (!coupon) return { success: false, message: 'Coupon not found' };
  if (user.balance < coupon.points) return { success: false, message: 'Insufficient points' };
  
  redemptionSheet().appendRow([new Date(), user.email, couponId, coupon.points, '', 'Pending', 'Web Request']);
  return { success: true, message: 'Request sent! Check email shortly.' };
}

function saveUserProfileSecure(idToken, profile) {
  const v = verifyFirebaseToken(idToken);
  if (!v.success) return { success: false, message: 'Auth failed' };
  const sheet = userProfilesSheet();
  const data = sheet.getDataRange().getValues();
  for (let i=1; i<data.length; i++) {
    if (String(data[i][0]).toLowerCase() === v.email.toLowerCase()) {
      sheet.getRange(i+1, 2, 1, 4).setValues([[profile.dob, profile.gender, profile.phone, profile.instagram]]);
      return { success: true };
    }
  }
  sheet.appendRow([v.email, profile.dob, profile.gender, profile.phone, profile.instagram]);
  return { success: true };
}

function getUserProfileSecure(idToken) {
  const v = verifyFirebaseToken(idToken);
  if (!v.success) return null;
  const data = userProfilesSheet().getDataRange().getValues();
  for (let i=1; i<data.length; i++) {
    if (String(data[i][0]).toLowerCase() === v.email.toLowerCase()) {
      return { email: v.email, dob: data[i][1], gender: data[i][2], phone: data[i][3], instagram: data[i][4] };
    }
  }
  return null;
}

function submitFeedbackSecure(idToken, rating, message, category) {
  const v = verifyFirebaseToken(idToken);
  if (!v.success) return { success: false, message: 'Auth failed' };
  feedbackSheet().appendRow([new Date(), v.email, rating, category, message]);
  return { success: true };
}

function getPreviousUploadsSecure(idToken) {
  const u = getUserDataSecure(idToken);
  return u && !u.error ? u.uploads : [];
}

// --- REFERRALS & HELPERS ---

function createReferralEntry(email) {
  const sheet = referralsSheet();
  const code = generateReferralCode(email);
  sheet.appendRow([email, code, 0, 0, new Date(), 0]);
  return code;
}

function generateReferralCode(email) {
  let prefix = email.split('@')[0].replace(/[^a-z0-9]/gi, '').substring(0, 8) || 'USER';
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, email + Date.now()).slice(0, 4).map(b=>('0'+(b&0xFF).toString(16)).slice(-2)).join('');
  return 'TK_' + prefix.toUpperCase() + '_' + hash.toUpperCase();
}

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function trackerSheet() { return ss().getSheetByName(CONFIG.TRACKER_SHEET); }
function redemptionSheet() { return ss().getSheetByName(CONFIG.REDEMPTION_SHEET); }
function couponsSheet() { return ss().getSheetByName(CONFIG.COUPONS_SHEET); }
function referralsSheet() { return getSheetOrMake(CONFIG.REFERRALS_SHEET, ['Email','Code','Referrers','Referees','Date','Bonus']); }
function feedbackSheet() { return getSheetOrMake(CONFIG.FEEDBACK_SHEET, ['Timestamp','Email','Rating','Category','Message']); }
function userProfilesSheet() { return getSheetOrMake(CONFIG.USER_PROFILES_SHEET, ['Email','DOB','Gender','Phone','Instagram']); }

function getSheetOrMake(name, headers) {
  let s = ss().getSheetByName(name);
  if(!s) { s = ss().insertSheet(name); s.appendRow(headers); }
  return s;
}

function verifyFirebaseToken(idToken) {
  try {
    // You MUST set this in File > Project Properties > Script Properties
    const key = PropertiesService.getScriptProperties().getProperty(CONFIG.FIREBASE_KEY_PROP); 
    if(!key) throw "Firebase API Key not set in Script Properties";
    
    const res = UrlFetchApp.fetch('https://www.googleapis.com/identitytoolkit/v3/relyingparty/getAccountInfo?key='+key, { 
      method:'post', 
      contentType:'application/json', 
      payload:JSON.stringify({idToken:idToken}), 
      muteHttpExceptions:true 
    });
    const json = JSON.parse(res.getContentText());
    if(json.users && json.users.length) return { success:true, email:json.users[0].email, displayName:json.users[0].displayName||'' };
  } catch(e) {
    Logger.log("Auth Error: " + e);
  }
  return { success:false };
}

function sendEmailSafe(email, sub, body) {
  try { if(email) MailApp.sendEmail(email, sub, body); } catch(e) { Logger.log('Mail error: '+e); }
}

function shuffleArray(arr) {
  if (!arr || !arr.length) return arr;
  const s = arr.slice();
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [s[i], s[j]] = [s[j], s[i]];
  }
  return s;
}

function getFirebaseConfig() {
  const p = PropertiesService.getScriptProperties();
  return { apiKey: p.getProperty(CONFIG.FIREBASE_KEY_PROP), authDomain: p.getProperty('FIREBASE_AUTH_DOMAIN'), projectId: p.getProperty('FIREBASE_PROJECT_ID') };
}
