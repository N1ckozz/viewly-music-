import {canReadCampaign,isPrivateCampaign} from './campaign-privacy.js';
import {socialAvailability} from './social-oauth.js';
export function creatorWorkbench(db,actor){
 const id=actor.id;
 const get=(sql,...args)=>db.prepare(sql).get(...args);
 const all=(sql,...args)=>db.prepare(sql).all(...args);
 const count=(sql,...args)=>Number(get(sql,...args)?.n||0);
 const memberships=all("SELECT c.id,c.title,c.status,c.pricing_model,c.cpm_rate_cents,c.reward_cents,c.sandbox_funded_cents,c.sandbox_spent_cents,c.paid_cents,c.spent_cents,u.display_name AS artist_name,m.mode,m.created_at,b.background_file,r.cover_name FROM campaign_memberships m JOIN campaigns c ON c.id=m.campaign_id JOIN users u ON u.id=c.owner_id JOIN releases r ON r.id=c.release_id LEFT JOIN campaign_branding b ON b.campaign_id=c.id WHERE m.user_id=? AND c.moderation_status='visible' AND u.status='active' AND r.visibility='public' ORDER BY m.created_at DESC LIMIT 100",id).filter(c=>canReadCampaign(db,c.id,actor)).map(({background_file,cover_name,...c})=>({...c,invite_only:isPrivateCampaign(db,c.id),cover_url:background_file?'/api/promotions/'+c.id+'/image/background':cover_name?'/media/'+cover_name:null}));
 const connected=all("SELECT provider,display_name,status,connected_at FROM social_connections WHERE user_id=?",id);
 const submissions=all("SELECT s.id,s.campaign_id,s.status,s.created_at,c.title,c.status AS campaign_status,p.review_status,p.reported_views,p.accrued_cents,p.settled_cents,p.last_checked_at,p.risk_flag,p.post_access FROM submissions s JOIN campaigns c ON c.id=s.campaign_id LEFT JOIN cpm_submissions p ON p.submission_id=s.id WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 100",id).filter(s=>canReadCampaign(db,s.campaign_id,actor));
 return {account_id:id,ready:socialAvailability(),connections:connected,memberships,submissions,counts:{
 joined:count("SELECT COUNT(*) AS n FROM campaign_memberships WHERE user_id=?",id),
 submissions:count("SELECT COUNT(*) AS n FROM submissions WHERE user_id=?",id),
 reported_views:count("SELECT COALESCE(SUM(reported_views),0) AS n FROM cpm_submissions WHERE clipper_id=? AND last_checked_at IS NOT NULL",id),
 pending:count("SELECT COUNT(*) AS n FROM submissions s LEFT JOIN cpm_submissions p ON p.submission_id=s.id WHERE s.user_id=? AND COALESCE(p.review_status,s.status) IN ('pending','sandbox_pending')",id),
 drafts:count("SELECT COUNT(*) AS n FROM campaigns WHERE owner_id=? AND status IN ('draft','awaiting_payment')",id),
 releases:count("SELECT COUNT(*) AS n FROM releases WHERE owner_id=?",id)
 }};
}
