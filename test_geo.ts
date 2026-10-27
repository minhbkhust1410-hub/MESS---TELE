import { ECOPARK_BUILDINGS, findBuildingGeo, findNearestBuildings, calculateGeoProximityScore } from './src/services/ecopark-geo.js';

console.log('Tổng số tòa/phân khu đã nạp:', Object.keys(ECOPARK_BUILDINGS).length);
console.log('Danh sách tòa:');
for (const [name, b] of Object.entries(ECOPARK_BUILDINGS)) {
  console.log(`- [${b.cluster}] ${name} -> Lat: ${b.lat}, Lng: ${b.lng}`);
}

console.log('\n--- TEST TÌM KIẾM TÒA & TÍNH KHOẢNG CÁCH ---');
const testQueries = ['S1', 'h2', 'r1 onsen', 'toà c westbay', 'aqua bay sky 2', 'vườn mai'];
for (const q of testQueries) {
  const geo = findBuildingGeo(q);
  console.log(`Query "${q}" => Đã nhận diện: ${geo.name} (${geo.project} - ${geo.cluster})`);
}

console.log('\n--- TEST GỢI Ý CĂN GẦN NHẤT KHI KHÁCH HỎI SWANLAKE ONSEN R2 ---');
const nearest = findNearestBuildings('Swanlake Onsen R2', 5);
for (const n of nearest) {
  console.log(`* ${n.building.name}: ${n.description}`);
}

console.log('\n--- TEST TÍNH ĐIỂM PROXIMITY GIỮA 2 TÒA ---');
console.log('Sky Oasis S1 vs Haven Park H2:', calculateGeoProximityScore('Sky Oasis S1', 'Haven Park H2'));
console.log('Westbay Toà A vs Westbay Toà C:', calculateGeoProximityScore('Westbay Toà A', 'Westbay Toà C'));
