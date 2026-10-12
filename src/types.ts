export type Platform = 'Instagram' | 'LinkedIn' | 'Facebook' | 'X'
export type PostStatus = 'draft' | 'approved' | 'scheduled'
export type ContentLanguage = 'en' | 'ar'
export type Market = 'General' | 'UAE' | 'Saudi Arabia' | 'Kuwait' | 'Gulf'
export interface Post { id:string; idea:string; platform:Platform; tone:string; caption:string; hashtags:string[]; status:PostStatus; createdAt:string; scheduledFor?:string; language?:ContentLanguage; market?:Market; approvedAt?:string; approvedBy?:string }
