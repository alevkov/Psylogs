// Dutch fields color palette
export const DUTCH_COLORS = [
  "#e60049", // bright red
  "#0bb4ff", // bright blue
  "#50e991", // bright green
  "#e6d800", // bright yellow
  "#9b19f5", // bright purple
  "#ffa300", // bright orange
  "#dc0ab4", // bright pink
  "#b3d4ff", // light blue
  "#00bfa0", // teal
  // Extended palette with additional distinct colors
  "#7c1158", // deep purple
  "#4421af", // indigo
  "#0d88e6", // medium blue
  "#00b7c7", // turquoise
  "#5ad45a", // medium green
  "#8be04e", // lime green
  "#ebdc78", // light yellow
  "#fd7f00", // dark orange
  "#fa3e10", // vermilion
  "#f93b78", // hot pink
];

// Function to get a consistent color for a substance based on its name
export function getSubstanceColor(substanceName: string, isDarkMode = false): string {
  // Handle empty or undefined substance names
  if (!substanceName) {
    return isDarkMode ? 'rgba(60, 60, 60, 0.5)' : 'rgba(240, 240, 240, 0.5)';
  }

  // Create a numeric hash from the substance name
  let hash = 0;
  for (let i = 0; i < substanceName.length; i++) {
    hash = ((hash << 5) - hash) + substanceName.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  // Get a positive index value
  hash = Math.abs(hash);
  
  // Get the base color from the Dutch palette
  const colorIndex = hash % DUTCH_COLORS.length;
  const baseColor = DUTCH_COLORS[colorIndex];
  
  // Convert hex to RGB and apply transparency for light/dark modes
  const rgb = hexToRgb(baseColor);
  
  if (isDarkMode) {
    // For dark mode, make colors more vibrant but with some transparency
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.75)`;
  } else {
    // For light mode, make colors bright and rich
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.65)`;
  }
}

// Helper function to convert hex to rgb
function hexToRgb(hex: string): { r: number, g: number, b: number } {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Parse the hex values
  const bigint = parseInt(hex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  
  return { r, g, b };
}

// Function to generate a consistent text color for contrast
export function getContrastTextColor(backgroundColor: string): string {
  // If we have an rgba, extract the rgb part
  const rgbaMatch = backgroundColor.match(/rgba\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1], 10);
    const g = parseInt(rgbaMatch[2], 10);
    const b = parseInt(rgbaMatch[3], 10);
    
    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Return white for dark backgrounds, dark for light backgrounds
    return luminance > 0.5 ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)';
  }
  
  // Default to dark text if we can't determine
  return 'rgba(0, 0, 0, 0.8)';
}