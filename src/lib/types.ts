export interface Account {
  id: string;
  auth_id: string;
  name: string | null;
  email: string;
  goals: string[] | null;
  created_at: string;
}

export interface StyleReport {
  id: string;
  account_id: string;
  title: string | null;
  description: string | null;
  skin_tone: string | null;
  undertone: string | null;
  color_family: string | null;
  best_colors: string[] | null;
  best_colors_description: string | null;
  accent_colors: string[] | null;
  accent_colors_description: string | null;
  neutral_staples: string[] | null;
  neutral_staples_description: string | null;
  use_sparingly: string[] | null;
  use_sparingly_description: string | null;
  high_contrast_pairings: string[] | null;
  harmony_note: string[] | null;
  metals: string | null;
  chains: string | null;
  recommended_shapes: string | null;
  face_shape: string | null;
  gender: string | null;
  age: string | null;
  hair_color: string | null;
  hair_length: string | null;
  profile_image_1_id: string | null;
  profile_image_2_id: string | null;
  profile_image_3_id: string | null;
  generated_at: string;
}

export interface MoodBoard {
  id: string;
  account_id: string;
  style_report_id: string;
  title: string;
  description: string | null;
  occasion: string | null;
  goal: string | null;
  colors: string[] | null;
  image_url: string | null;
  slug: string | null;
  public?: boolean;
  is_official?: boolean;
  category?: string | null;
  store_name?: string | null;
  comparison_of?: string | null;
  created_at: string;
  pieces?: Piece[];
}

export interface Piece {
  id: string;
  mood_board_id: string;
  name: string | null;
  title: string | null;
  price: number | null;
  url: string | null;
  image_url: string | null;
  colors: string[] | null;
  style: string | null;
  description: string | null;
  store: string | null;
  keywords: string[] | null;
  slug: string | null;
  created_at: string;
}

export interface ProfileImage {
  id: string;
  account_id: string;
  storage_path: string;
  public_url: string;
  created_at: string;
}
