export type Platform = 'Instagram' | 'LinkedIn' | 'Facebook' | 'X'
export type PostStatus = 'draft' | 'approved' | 'scheduled'
export interface Post { id:string; idea:string; platform:Platform; tone:string; caption:string; hashtags:string[]; status:PostStatus; createdAt:string; scheduledFor?:string }
