/* Central invite-only policy. The original artist's public release remains public. */
export function initCampaignPrivacy(db){
 db.exec("CREATE TABLE IF NOT EXISTS campaign_private(campaign_id TEXT PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE)");
}
export function isPrivateCampaign(db,cid){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='campaign_private'").get())return false;
 return !!db.prepare('SELECT 1 FROM campaign_private WHERE campaign_id=?').get(cid);
}
export function publicOnly(db,alias='c'){
 if(!/^[a-z]+$/.test(alias))throw Error('Invalid alias');
 return db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='campaign_private'").get()?' AND NOT EXISTS(SELECT 1 FROM campaign_private private_entry WHERE private_entry.campaign_id='+alias+'.id)':'';
}
export function canReadCampaign(db,cid,actor){
 if(!isPrivateCampaign(db,cid))return true;
 if(!actor)return false;
 if(actor.role==='admin'||db.prepare('SELECT 1 FROM campaigns WHERE id=? AND owner_id=?').get(cid,actor.id))return true;
 return !!db.prepare("SELECT 1 FROM ecosystem_invites WHERE campaign_id=? AND recipient_id=? AND state='accepted'").get(cid,actor.id);
}
export function guardCampaignPath(db,pathname,actor,fail){
 const match=pathname.match(/^\/api\/(?:campaigns|promotions|growth\/campaigns)\/([a-f0-9-]{36})(?:\/|$)/i);
 if(match&&!canReadCampaign(db,match[1].toLowerCase(),actor))throw fail(404,'Campaign not found.');
}
