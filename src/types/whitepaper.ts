export interface Section {
  title: string;
  page: number;
}

export interface WhitepaperContent {
  [key: number]: string;
}

export interface WhitepaperStyles {
  whitepaper-content: string;
  main-title: string;
  subtitle: string;
  section: string;
} 