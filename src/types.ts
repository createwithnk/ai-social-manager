export type Platform = 'Instagram' | 'LinkedIn' | 'Facebook' | 'X'
export type PostStatus = 'draft' | 'approved' | 'scheduled'
export type ContentLanguage = 'en' | 'ar' | 'hi' | 'ur'
export type Market = 'General' | 'UAE' | 'Saudi Arabia' | 'Kuwait' | 'Gulf'
export interface Media { path:string; name:string; type:string; size:number }
export interface Post { id:string; idea:string; platform:Platform; tone:string; caption:string; hashtags:string[]; status:PostStatus; createdAt:string; scheduledFor?:string; language?:ContentLanguage; market?:Market; media?:Media; revision?:number }
