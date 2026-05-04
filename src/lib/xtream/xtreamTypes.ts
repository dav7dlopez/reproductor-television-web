export interface XtreamCredentialsInput {
  serverUrl: string;
  username: string;
  password: string;
}

export interface XtreamUserInfoResponse {
  user_info?: {
    username?: string;
    password?: string;
    message?: string;
    auth?: number | string;
    status?: string;
    exp_date?: string;
    is_trial?: string | number;
    active_cons?: string | number;
    max_connections?: string | number;
    allowed_output_formats?: string[];
  };
  server_info?: Record<string, unknown>;
}

export interface XtreamLiveCategory {
  category_id: string | number;
  category_name: string;
  parent_id?: string | number;
}

export interface XtreamLiveStream {
  num?: number;
  name: string;
  stream_type?: string;
  stream_id: number | string;
  stream_icon?: string;
  epg_channel_id?: string;
  added?: string;
  category_id?: string | number;
  custom_sid?: string;
  tv_archive?: number | string;
  direct_source?: string;
  tv_archive_duration?: number | string;
}

export interface XtreamLoadedData {
  userInfo: XtreamUserInfoResponse;
  categories: XtreamLiveCategory[];
  streams: XtreamLiveStream[];
}
