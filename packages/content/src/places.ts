// Điểm đặt tên cho kiểm thử: `?at=<id>` lúc vào game và `/gm tp <id>` (chỉ tài khoản thử, server kiểm).
// Chỉ server và công cụ kiểm import; client chỉ gửi id, không cần biết tọa độ.
import type { PlaceDef } from '@dtl/shared';
import placesJson from '../data/places.json';

export const PLACES = placesJson as PlaceDef[];
export const PLACE = new Map<string, PlaceDef>(PLACES.map((p) => [p.id, p]));

/** Mã địa điểm hợp lệ: chữ thường, số, gạch dưới, tối đa 24 ký tự. */
export const PLACE_ID = /^[a-z0-9_]{1,24}$/;
