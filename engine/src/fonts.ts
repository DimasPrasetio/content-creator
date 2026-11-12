import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";

// Anton = judul condensed tebal, Plus Jakarta Sans = teks pendukung.
const anton = loadAnton("normal", { weights: ["400"], subsets: ["latin"] });
const jakarta = loadJakarta("normal", { weights: ["500", "700", "800"], subsets: ["latin"] });

export const DISPLAY = anton.fontFamily;
export const BODY = jakarta.fontFamily;
