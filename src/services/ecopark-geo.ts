/**
 * ECOPARK GEOGRAPHIC COORDINATES & MASTER PLAN DATABASE
 * Đối chiếu chuẩn xác theo Bản Đồ Tổng Thể Ecopark Hưng Yên & Google Maps
 * Nạp chi tiết toàn bộ các tòa chung cư, phân khu biệt thự, nhà phố và tiện ích
 */

export interface EcoparkBuildingGeo {
  id: string;
  name: string;
  project: string;
  cluster: string;
  lat: number;
  lng: number;
  description: string;
  aliases: string[];
}

export const ECOPARK_BUILDINGS: Record<string, EcoparkBuildingGeo> = {
  // ==========================================
  // 1. CỤM VỊNH ĐẢO — TUYẾN PHỐ ĐI BỘ 7.5KM
  // ==========================================
  'Sky Oasis S1': {
    id: 'so_s1',
    name: 'Toà S1 Sky Oasis',
    project: 'Sky Oasis',
    cluster: 'Cụm Vịnh Đảo',
    lat: 20.9576,
    lng: 105.9318,
    description: 'Toà S1 chung cư Sky Oasis, đầu tuyến phố đi bộ Hàn Quốc, view biệt thự đảo',
    aliases: ['s1', 'toà s1', 'toa s1', 's1 sky oasis', 's1 skyoasis', 's1 vinh dao'],
  },
  'Sky Oasis S2': {
    id: 'so_s2',
    name: 'Toà S2 Sky Oasis',
    project: 'Sky Oasis',
    cluster: 'Cụm Vịnh Đảo',
    lat: 20.9570,
    lng: 105.9314,
    description: 'Toà S2 chung cư Sky Oasis, kẹp giữa S1 và S3, view trọn cụm đảo triệu đô',
    aliases: ['s2', 'toà s2', 'toa s2', 's2 sky oasis', 's2 skyoasis'],
  },
  'Sky Oasis S3': {
    id: 'so_s3',
    name: 'Toà S3 Sky Oasis',
    project: 'Sky Oasis',
    cluster: 'Cụm Vịnh Đảo',
    lat: 20.9563,
    lng: 105.9310,
    description: 'Toà S3 chung cư Sky Oasis, nối liền tháp đôi S-Premium',
    aliases: ['s3', 'toà s3', 'toa s3', 's3 sky oasis', 's3 skyoasis'],
  },
  'Sky Oasis S-Premium': {
    id: 'so_sprem',
    name: 'Toà S-Premium Sky Oasis',
    project: 'Sky Oasis',
    cluster: 'Cụm Vịnh Đảo',
    lat: 20.9580,
    lng: 105.9322,
    description: 'Toà tháp nghỉ dưỡng 5 sao cao cấp nhất Sky Oasis, sảnh đón tiêu chuẩn khách sạn',
    aliases: ['s-premium', 'sprem', 's premium', 'toà sprem', 's-prem', 'sprem sky oasis'],
  },
  'Sol Forest SO1': {
    id: 'sf_so1',
    name: 'Toà SO1 Sol Forest',
    project: 'Sol Forest',
    cluster: 'Cụm Vịnh Đảo',
    lat: 20.9551,
    lng: 105.9309,
    description: 'Tháp rừng thẳng đứng SO1 Sol Forest, ban công sân vườn bao trọn vịnh đảo',
    aliases: ['so1', 'so-1', 'toà so1', 'toa so1', 'sf1', 'toà sf1', 'sol forest so1'],
  },
  'Sol Forest SO2': {
    id: 'sf_so2',
    name: 'Toà SO2 Sol Forest',
    project: 'Sol Forest',
    cluster: 'Cụm Vịnh Đảo',
    lat: 20.9545,
    lng: 105.9307,
    description: 'Tháp rừng thẳng đứng SO2 Sol Forest, đối diện biệt thự đảo Ecopark Grand',
    aliases: ['so2', 'so-2', 'toà so2', 'toa so2', 'sf2', 'toà sf2', 'sol forest so2'],
  },
  'Haven Park H1': {
    id: 'hp_h1',
    name: 'Toà H1 Haven Park',
    project: 'Haven Park',
    cluster: 'Cụm Vịnh Đảo',
    lat: 20.9528,
    lng: 105.9302,
    description: 'Tháp H1 Haven Park, công viên nhiệt đới ngọc lục bảo, liền kề Sol Forest',
    aliases: ['h1', 'toà h1', 'toa h1', 'h1 haven park', 'h1 havenpark'],
  },
  'Haven Park H2': {
    id: 'hp_h2',
    name: 'Toà H2 Haven Park',
    project: 'Haven Park',
    cluster: 'Cụm Vịnh Đảo',
    lat: 20.9522,
    lng: 105.9298,
    description: 'Tháp H2 Haven Park, đón trọn suối nước và đại công viên cây xanh',
    aliases: ['h2', 'toà h2', 'toa h2', 'h2 haven park', 'h2 havenpark'],
  },
  'Sky Forest': {
    id: 'sky_forest',
    name: 'Tổ Hợp Sky Forest (SF1-SF3)',
    project: 'Sky Forest',
    cluster: 'Cụm Vịnh Đảo',
    lat: 20.9490,
    lng: 105.9290,
    description: 'Điểm cuối cung đường vịnh đảo, 8 công viên bay chân mây, giao lộ Vườn Vua',
    aliases: ['sky forest', 'skyforest', 'toà sf1', 'toà sf2', 'toà sf3'],
  },

  // ==========================================
  // 2. CỤM SWANLAKE RESIDENCES & HỒ THIÊN NGA
  // ==========================================
  'Swanlake Onsen R1': {
    id: 'sl_r1',
    name: 'Toà R1 Swanlake Onsen',
    project: 'Swanlake Onsen',
    cluster: 'Cụm Khoáng Nóng Hồ Thiên Nga',
    lat: 20.9588,
    lng: 105.9323,
    description: 'Tháp R1 khoáng nóng Swanlake, dẫn nguồn khoáng nóng trực tiếp vào từng căn',
    aliases: ['r1', 'toà r1', 'toa r1', 'r1 onsen', 'r1 swanlake'],
  },
  'Swanlake Onsen R2': {
    id: 'sl_r2',
    name: 'Toà R2 Swanlake Onsen',
    project: 'Swanlake Onsen',
    cluster: 'Cụm Khoáng Nóng Hồ Thiên Nga',
    lat: 20.9593,
    lng: 105.9326,
    description: 'Tháp R2 Swanlake Onsen, ôm trọn hồ Thiên Nga, khu spa và tắm khoáng Nhật Bản',
    aliases: ['r2', 'toà r2', 'toa r2', 'r2 onsen', 'r2 swanlake'],
  },
  'Swanlake Onsen R3': {
    id: 'sl_r3',
    name: 'Toà R3 Swanlake Onsen',
    project: 'Swanlake Onsen',
    cluster: 'Cụm Khoáng Nóng Hồ Thiên Nga',
    lat: 20.9598,
    lng: 105.9329,
    description: 'Tháp R3 Swanlake Onsen, kết nối trực diện vườn Nhật và công viên Hồ Thiên Nga',
    aliases: ['r3', 'toà r3', 'toa r3', 'r3 onsen', 'r3 swanlake'],
  },
  'The Landmark L1': {
    id: 'sl_l1',
    name: 'Toà L1 The Landmark Swanlake',
    project: 'Swanlake Onsen',
    cluster: 'Cụm Khoáng Nóng Hồ Thiên Nga',
    lat: 20.9603,
    lng: 105.9332,
    description: 'Tháp căn hộ khoáng nóng cao cấp The Landmark L1, hồ bơi nước mặn 4 mùa chân mây',
    aliases: ['l1', 'toà l1', 'toa l1', 'landmark l1', 'the landmark l1', 'l1 onsen'],
  },
  'The Landmark L2': {
    id: 'sl_l2',
    name: 'Toà L2 The Landmark Swanlake',
    project: 'Swanlake Onsen',
    cluster: 'Cụm Khoáng Nóng Hồ Thiên Nga',
    lat: 20.9607,
    lng: 105.9335,
    description: 'Tháp căn hộ khoáng nóng cao cấp The Landmark L2, view panorama công viên hồ',
    aliases: ['l2', 'toà l2', 'toa l2', 'landmark l2', 'the landmark l2', 'l2 onsen'],
  },
  'Meraki Residences': {
    id: 'meraki',
    name: 'Tổ Hợp Meraki Residences (M1-M2)',
    project: 'Meraki Residences',
    cluster: 'Cụm Y Tế & Trị Liệu',
    lat: 20.9638,
    lng: 105.9375,
    description: 'Căn hộ trị liệu dưỡng lão chuẩn quốc tế, liền kề Bệnh viện Y khoa Tokyo',
    aliases: ['meraki', 'meraki residences', 'm1 meraki', 'm2 meraki'],
  },

  // ==========================================
  // 3. CỤM WESTBAY (4 TOÀ A, B, C, D)
  // ==========================================
  'Westbay Toà A': {
    id: 'wb_a',
    name: 'Toà A Westbay',
    project: 'Westbay',
    cluster: 'Cụm Westbay & Thảo Nguyên',
    lat: 20.9642,
    lng: 105.9452,
    description: 'Toà A chung cư Westbay (dáng chữ V), gần trường liên cấp Edison và phố đi bộ',
    aliases: ['toà a westbay', 'toa a westbay', 'tòa a wb', 'wba', 'westbay a'],
  },
  'Westbay Toà B': {
    id: 'wb_b',
    name: 'Toà B Westbay',
    project: 'Westbay',
    cluster: 'Cụm Westbay & Thảo Nguyên',
    lat: 20.9638,
    lng: 105.9458,
    description: 'Toà B chung cư Westbay, tiện ích quảng trường trung tâm và siêu thị',
    aliases: ['toà b westbay', 'toa b westbay', 'tòa b wb', 'wbb', 'westbay b'],
  },
  'Westbay Toà C': {
    id: 'wb_c',
    name: 'Toà C Westbay',
    project: 'Westbay',
    cluster: 'Cụm Westbay & Thảo Nguyên',
    lat: 20.9632,
    lng: 105.9463,
    description: 'Toà C chung cư Westbay, view hồ bơi và khu biệt thự Thảo Nguyên',
    aliases: ['toà c westbay', 'toa c westbay', 'tòa c wb', 'wbc', 'westbay c'],
  },
  'Westbay Toà D': {
    id: 'wb_d',
    name: 'Toà D Westbay',
    project: 'Westbay',
    cluster: 'Cụm Westbay & Thảo Nguyên',
    lat: 20.9627,
    lng: 105.9468,
    description: 'Toà D chung cư Westbay, kề sát cầu Thủy Tiên nối sang vịnh hồ Aquabay',
    aliases: ['toà d westbay', 'toa d westbay', 'tòa d wb', 'wbd', 'westbay d'],
  },

  // ==========================================
  // 4. CỤM AQUABAY SKY RESIDENCES (7 TOÀ)
  // ==========================================
  'Aquabay Sky 1': {
    id: 'ab_sky1',
    name: 'Toà Sky 1 Aqua Bay',
    project: 'Aquabay',
    cluster: 'Cụm Vịnh Hồ Aqua Bay',
    lat: 20.9593,
    lng: 105.9482,
    description: 'Toà Sky 1 chung cư Aqua Bay Sky Residences, view trực diện quảng trường Marina',
    aliases: ['sky 1', 'sky1', 'toà sky 1', 'sky 1 aquabay', 'sky1 aqua'],
  },
  'Aquabay Sky 2': {
    id: 'ab_sky2',
    name: 'Toà Sky 2 Aqua Bay',
    project: 'Aquabay',
    cluster: 'Cụm Vịnh Hồ Aqua Bay',
    lat: 20.9597,
    lng: 105.9486,
    description: 'Toà Sky 2 chung cư Aqua Bay, trung tâm vịnh hồ mặt nước 17ha',
    aliases: ['sky 2', 'sky2', 'toà sky 2', 'sky 2 aquabay', 'sky2 aqua'],
  },
  'Aquabay Sky 3': {
    id: 'ab_sky3',
    name: 'Toà Sky 3 Aqua Bay',
    project: 'Aquabay',
    cluster: 'Cụm Vịnh Hồ Aqua Bay',
    lat: 20.9601,
    lng: 105.9490,
    description: 'Toà Sky 3 chung cư Aqua Bay, view sân golf EPGA và vịnh hồ Marina',
    aliases: ['sky 3', 'sky3', 'toà sky 3', 'sky 3 aquabay', 'sky3 aqua'],
  },
  'Aquabay Lake 1': {
    id: 'ab_lake1',
    name: 'Toà Lake 1 Aqua Bay',
    project: 'Aquabay',
    cluster: 'Cụm Vịnh Hồ Aqua Bay',
    lat: 20.9605,
    lng: 105.9494,
    description: 'Toà Lake 1 chung cư Aqua Bay, ban công trực diện mặt hồ lộng gió',
    aliases: ['lake 1', 'lake1', 'toà lake 1', 'lake 1 aquabay', 'lake1 aqua'],
  },
  'Aquabay Lake 2': {
    id: 'ab_lake2',
    name: 'Toà Lake 2 Aqua Bay',
    project: 'Aquabay',
    cluster: 'Cụm Vịnh Hồ Aqua Bay',
    lat: 20.9609,
    lng: 105.9498,
    description: 'Toà Lake 2 chung cư Aqua Bay, đối diện bến du thuyền Marina Arc',
    aliases: ['lake 2', 'lake2', 'toà lake 2', 'lake 2 aquabay', 'lake2 aqua'],
  },
  'Aquabay Park 1': {
    id: 'ab_park1',
    name: 'Toà Park 1 Grand Park Aqua Bay',
    project: 'Aquabay',
    cluster: 'Cụm Vịnh Hồ Aqua Bay',
    lat: 20.9614,
    lng: 105.9491,
    description: 'Toà Park 1 thuộc phân khu Grand Park Aqua Bay, view sân golf 18 hố xanh mát',
    aliases: ['park 1', 'park1', 'toà park 1', 'grand park 1', 'park 1 aquabay'],
  },
  'Aquabay Park 2': {
    id: 'ab_park2',
    name: 'Toà Park 2 Grand Park Aqua Bay',
    project: 'Aquabay',
    cluster: 'Cụm Vịnh Hồ Aqua Bay',
    lat: 20.9618,
    lng: 105.9488,
    description: 'Toà Park 2 thuộc phân khu Grand Park Aqua Bay, view trọn học viện golf Els',
    aliases: ['park 2', 'park2', 'toà park 2', 'grand park 2', 'park 2 aquabay'],
  },

  // ==========================================
  // 5. GIAI ĐOẠN 1 (CŨ) — RỪNG CỌ & BIỆT THỰ
  // ==========================================
  'Rừng Cọ Toà A': {
    id: 'rc_a',
    name: 'Chung cư Rừng Cọ Toà A (A1-A3)',
    project: 'Rừng Cọ',
    cluster: 'Giai đoạn 1 (Cũ)',
    lat: 20.9720,
    lng: 105.9322,
    description: 'Toà A1, A2, A3 chung cư Rừng Cọ, kề sát trường Greenfield và Phố Trúc',
    aliases: ['a1 rừng cọ', 'a2 rừng cọ', 'a3 rừng cọ', 'toà a rừng cọ', 'rừng cọ toà a'],
  },
  'Rừng Cọ Toà B': {
    id: 'rc_b',
    name: 'Chung cư Rừng Cọ Toà B (B1-B2)',
    project: 'Rừng Cọ',
    cluster: 'Giai đoạn 1 (Cũ)',
    lat: 20.9723,
    lng: 105.9328,
    description: 'Toà B1, B2 chung cư Rừng Cọ, trung tâm quảng trường Rừng Cọ và bể bơi',
    aliases: ['b1 rừng cọ', 'b2 rừng cọ', 'toà b rừng cọ', 'rừng cọ toà b'],
  },
  'Rừng Cọ Toà C': {
    id: 'rc_c',
    name: 'Chung cư Rừng Cọ Toà C (C1-C3)',
    project: 'Rừng Cọ',
    cluster: 'Giai đoạn 1 (Cũ)',
    lat: 20.9726,
    lng: 105.9333,
    description: 'Toà C1, C2, C3 chung cư Rừng Cọ, view công viên Mùa Hạ và sông Bắc Hưng Hải',
    aliases: ['c1 rừng cọ', 'c2 rừng cọ', 'c3 rừng cọ', 'toà c rừng cọ', 'rừng cọ toà c'],
  },
  'Rừng Cọ Toà D & E': {
    id: 'rc_de',
    name: 'Chung cư Rừng Cọ Toà D & E',
    project: 'Rừng Cọ',
    cluster: 'Giai đoạn 1 (Cũ)',
    lat: 20.9729,
    lng: 105.9338,
    description: 'Toà D1, E1 chung cư Rừng Cọ, giáp khu biệt thự Vườn Tùng và nhà trẻ',
    aliases: ['d1 rừng cọ', 'e1 rừng cọ', 'toà d rừng cọ', 'toà e rừng cọ'],
  },

  // ==========================================
  // 6. KHU BIỆT THỰ & NHÀ PHỐ THẤP TẦNG
  // ==========================================
  'Ecopark Grand The Island': {
    id: 'bt_dao',
    name: 'Biệt Thự Đảo Ecopark Grand The Island',
    project: 'Ecopark Grand',
    cluster: 'Cụm Vịnh Đảo',
    lat: 20.9545,
    lng: 105.9340,
    description: 'Quần thể biệt thự đảo siêu sang độc bản vươn ra mặt nước, bảo vệ 24/7',
    aliases: ['biệt thự đảo', 'biet thu dao', 'ecopark grand', 'the island', 'đảo triệu đô'],
  },
  'Shophouse Marina Arc': {
    id: 'np_marina_arc',
    name: 'Nhà Phố Shophouse Marina Arc',
    project: 'Marina Arc',
    cluster: 'Cụm Vịnh Hồ Aqua Bay',
    lat: 20.9620,
    lng: 105.9480,
    description: 'Dãy siêu shophouse cong hình cánh cung ôm trọn mặt hồ vịnh Aquabay',
    aliases: ['marina arc', 'marinaarc', 'shophouse marina arc'],
  },
  'Nhà Phố Thủy Nguyên': {
    id: 'np_thuy_nguyen',
    name: 'Nhà Phố Thủy Nguyên',
    project: 'Thủy Nguyên',
    cluster: 'Cụm Vịnh Hồ Aqua Bay',
    lat: 20.9610,
    lng: 105.9465,
    description: 'Khu nhà phố kinh doanh sầm uất Thủy Nguyên, cổng vào Aquabay',
    aliases: ['thủy nguyên', 'thuy nguyen', 'nhà phố thủy nguyên'],
  },
  'Nhà Phố Thảo Nguyên': {
    id: 'np_thao_nguyen',
    name: 'Nhà Phố Thảo Nguyên',
    project: 'Thảo Nguyên',
    cluster: 'Cụm Westbay & Thảo Nguyên',
    lat: 20.9625,
    lng: 105.9520,
    description: 'Khu nhà phố liền kề Thảo Nguyên, gần trường Edison và hồ cảnh quan',
    aliases: ['thảo nguyên', 'thao nguyen', 'nhà phố thảo nguyên'],
  },
  'Nhà Phố Thủy Trúc': {
    id: 'np_thuy_truc',
    name: 'Nhà Phố Thủy Trúc',
    project: 'Thủy Trúc',
    cluster: 'Cụm Vịnh Hồ Aqua Bay',
    lat: 20.9590,
    lng: 105.9470,
    description: 'Dãy nhà phố Thủy Trúc yên tĩnh, nhiều cây xanh ven vịnh hồ',
    aliases: ['thủy trúc', 'thuy truc', 'nhà phố thủy trúc'],
  },
  'Biệt Thự Mimosa': {
    id: 'bt_mimosa',
    name: 'Biệt Thự Mimosa Valley',
    project: 'Mimosa',
    cluster: 'Cụm Sân Golf & Vịnh Hồ',
    lat: 20.9660,
    lng: 105.9500,
    description: 'Khu biệt thự thung lũng Mimosa, liền kề sân golf Ecopark và hồ sinh thái',
    aliases: ['mimosa', 'mimosa valley', 'biệt thự mimosa'],
  },
  'Biệt Thự Marina': {
    id: 'bt_marina',
    name: 'Biệt Thự Marina',
    project: 'Marina',
    cluster: 'Cụm Vịnh Hồ Aqua Bay',
    lat: 20.9625,
    lng: 105.9485,
    description: 'Khu biệt thự song lập và đơn lập Marina ven hồ Aquabay',
    aliases: ['biệt thự marina', 'marina ecopark', 'khu marina'],
  },
  'Biệt Thự Vườn Tùng': {
    id: 'bt_vuon_tung',
    name: 'Biệt Thự Vườn Tùng (Giai đoạn 1)',
    project: 'Vườn Tùng',
    cluster: 'Giai đoạn 1 (Cũ)',
    lat: 20.9715,
    lng: 105.9345,
    description: 'Khu biệt thự đơn lập, song lập Vườn Tùng ven sông Bắc Hưng Hải',
    aliases: ['vườn tùng', 'vuon tung', 'biệt thự vườn tùng'],
  },
  'Biệt Thự Vườn Mai': {
    id: 'bt_vuon_mai',
    name: 'Biệt Thự Vườn Mai (Giai đoạn 1)',
    project: 'Vườn Mai',
    cluster: 'Giai đoạn 1 (Cũ)',
    lat: 20.9745,
    lng: 105.9365,
    description: 'Khu biệt thự Vườn Mai rợp bóng cây cổ thụ, liền kề công viên Mùa Thu',
    aliases: ['vườn mai', 'vuon mai', 'biệt thự vườn mai'],
  },
  'Nhà Phố Trúc': {
    id: 'np_pho_truc',
    name: 'Nhà Phố Phố Trúc (Giai đoạn 1)',
    project: 'Phố Trúc',
    cluster: 'Giai đoạn 1 (Cũ)',
    lat: 20.9730,
    lng: 105.9315,
    description: 'Tuyến phố kinh doanh, ẩm thực sầm uất đầu tiên của Ecopark',
    aliases: ['phố trúc', 'pho truc', 'nhà phố trúc'],
  },
  'Khu Đô Thị Park River': {
    id: 'np_park_river',
    name: 'Khu Đô Thị Park River',
    project: 'Park River',
    cluster: 'Giai đoạn 1 (Cũ)',
    lat: 20.9680,
    lng: 105.9320,
    description: 'Quần thể nhà phố thương mại và biệt thự ven sông Park River Ecopark',
    aliases: ['park river', 'parkriver'],
  },
  'Làng Hà Lan': {
    id: 'np_lang_ha_lan',
    name: 'Khu Làng Hà Lan',
    project: 'Làng Hà Lan',
    cluster: 'Cụm Vịnh Đảo',
    lat: 20.9590,
    lng: 105.9335,
    description: 'Tiểu khu nhà phố mang phong cách Châu Âu lãng mạn kề bên hồ Thiên Nga',
    aliases: ['làng hà lan', 'lang ha lan'],
  },
  'Spring Valley': {
    id: 'spring_valley',
    name: 'Khu Đô Thị Spring Valley',
    project: 'Spring Valley',
    cluster: 'Khu Mở Rộng',
    lat: 20.9665,
    lng: 105.9375,
    description: 'Thung lũng mùa xuân, liền kề trường đại học Tokyo và sân golf',
    aliases: ['spring valley', 'springvalley'],
  },

  // ==========================================
  // 7. TIỆN ÍCH TRỌNG ĐIỂM & ĐIỂM ĐỊNH VỊ
  // ==========================================
  'Hồ Thiên Nga': {
    id: 'poi_ho_thien_nga',
    name: 'Công Viên Hồ Thiên Nga (Swan Lake)',
    project: 'Hồ Thiên Nga',
    cluster: 'Tiện ích trung tâm',
    lat: 20.9585,
    lng: 105.9350,
    description: 'Trái tim xanh Ecopark rộng hơn 50ha, chèo thuyền kayak, đàn thiên nga tự nhiên',
    aliases: ['hồ thiên nga', 'ho thien nga', 'công viên hồ thiên nga', 'swan lake'],
  },
  'Sân Golf EPGA': {
    id: 'poi_golf_epga',
    name: 'Học Viện Golf Els Performance Golf Academy (EPGA)',
    project: 'Sân Golf',
    cluster: 'Tiện ích trung tâm',
    lat: 20.9640,
    lng: 105.9410,
    description: 'Sân tập golf tiêu chuẩn quốc tế và học viện golf hàng đầu Việt Nam',
    aliases: ['sân golf', 'san golf', 'epga', 'học viện golf'],
  },
  'Trường Chadwick Ecopark': {
    id: 'poi_chadwick',
    name: 'Trường Quốc Tế Chadwick Ecopark',
    project: 'Chadwick',
    cluster: 'Tiện ích giáo dục',
    lat: 20.9535,
    lng: 105.9345,
    description: 'Top trường quốc tế danh tiếng hàng đầu thế giới tại Ecopark',
    aliases: ['chadwick', 'trường chadwick'],
  },
  'Đại Học BUV': {
    id: 'poi_buv',
    name: 'Đại Học Anh Quốc Việt Nam (BUV)',
    project: 'BUV',
    cluster: 'Tiện ích giáo dục',
    lat: 20.9620,
    lng: 105.9360,
    description: 'Khuôn viên đại học tiêu chuẩn Anh Quốc hiện đại tại Ecopark',
    aliases: ['buv', 'đại học buv', 'đh anh quốc'],
  },
  'Đại Học Y Khoa Tokyo': {
    id: 'poi_thuv',
    name: 'Đại Học Y Khoa Tokyo Việt Nam (THUV)',
    project: 'THUV',
    cluster: 'Tiện ích giáo dục',
    lat: 20.9635,
    lng: 105.9370,
    description: 'Đại học y khoa chuẩn Nhật Bản liền kề bệnh viện quốc tế Tokyo',
    aliases: ['thuv', 'y khoa tokyo', 'đh y tokyo'],
  },
  'Trung Tâm Ecopark (Chung)': {
    id: 'poi_ecopark_general',
    name: 'Khu Đô Thị Ecopark (Tổng Thể)',
    project: 'Ecopark (Chung)',
    cluster: 'Trung tâm Ecopark',
    lat: 20.9600,
    lng: 105.9370,
    description: 'Tọa độ trung tâm toàn thành phố xanh Ecopark Hưng Yên',
    aliases: ['ecopark', 'eco park', 'khu đô thị ecopark'],
  },
};

/**
 * Tính khoảng cách đường chim bay giữa 2 toạ độ GPS bằng công thức Haversine
 * @returns Khoảng cách theo Kilomet (km)
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Bán kính Trái Đất (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Tìm kiếm tòa / phân khu chuẩn xác nhất dựa trên tên tòa hoặc chuỗi truy vấn người dùng nhập
 */
export function findBuildingGeo(query: string): EcoparkBuildingGeo {
  if (!query) return ECOPARK_BUILDINGS['Trung Tâm Ecopark (Chung)'];

  const cleanQuery = query.trim().toLowerCase();

  // 1. Khớp chính xác theo key hoặc ID
  for (const [key, b] of Object.entries(ECOPARK_BUILDINGS)) {
    if (key.toLowerCase() === cleanQuery || b.id.toLowerCase() === cleanQuery) {
      return b;
    }
  }

  // 2. Khớp theo danh sách từ khóa aliases (ví dụ: "s1", "h2", "r1 onsen", "toà c westbay"...)
  for (const b of Object.values(ECOPARK_BUILDINGS)) {
    for (const alias of b.aliases) {
      const aliasClean = alias.toLowerCase();
      // Khớp từ nguyên vẹn với regex ranh giới
      const reg = new RegExp(`(^|[^a-z0-9])${aliasClean.replace('+', '\\+')}([^a-z0-9]|$)`, 'i');
      if (reg.test(cleanQuery)) {
        return b;
      }
    }
  }

  // 3. Khớp theo tên dự án (ví dụ: "Sky Oasis", "Haven Park", "Swanlake", "Westbay"...)
  for (const b of Object.values(ECOPARK_BUILDINGS)) {
    if (cleanQuery.includes(b.project.toLowerCase())) {
      return b;
    }
  }

  return ECOPARK_BUILDINGS['Trung Tâm Ecopark (Chung)'];
}

/**
 * Tính khoảng cách thực tế giữa 2 tòa hoặc 2 phân khu bất kỳ trong Ecopark
 * @returns Khoảng cách theo km (VD: 0.28 km = 280m)
 */
export function getDistanceBetweenBuildings(buildingA: string, buildingB: string): number {
  const geoA = findBuildingGeo(buildingA);
  const geoB = findBuildingGeo(buildingB);
  if (geoA.id === geoB.id) return 0;
  return calculateHaversineDistance(geoA.lat, geoA.lng, geoB.lat, geoB.lng);
}

/**
 * Tìm danh sách các tòa hoặc dự án lân cận gần nhất với một vị trí mục tiêu
 * @param targetQuery Tên tòa hoặc dự án khách đang hỏi (VD: "Swanlake Onsen", "Haven Park H1")
 * @param topN Số lượng tòa gần nhất cần lấy
 */
export function findNearestBuildings(targetQuery: string, topN: number = 5): Array<{
  building: EcoparkBuildingGeo;
  distanceKm: number;
  distanceMeters: number;
  walkMinutes: number;
  description: string;
}> {
  const targetGeo = findBuildingGeo(targetQuery);
  const results = [];

  for (const b of Object.values(ECOPARK_BUILDINGS)) {
    if (b.id === targetGeo.id) continue;
    const distanceKm = calculateHaversineDistance(targetGeo.lat, targetGeo.lng, b.lat, b.lng);
    const distanceMeters = Math.round(distanceKm * 1000);
    // Vận tốc đi bộ trung bình: ~4.5 km/h (~75 m/phút)
    const walkMinutes = Math.max(1, Math.round(distanceMeters / 75));

    results.push({
      building: b,
      distanceKm,
      distanceMeters,
      walkMinutes,
      description: `Cách ${targetGeo.name} ~${distanceMeters}m (khoảng ${walkMinutes} phút đi bộ)`,
    });
  }

  results.sort((a, b) => a.distanceKm - b.distanceKm);
  return results.slice(0, topN);
}

/**
 * Chấm điểm khoảng cách địa lý (0 - 100 điểm) kèm câu diễn giải thân thiện chuẩn môi giới
 */
export function calculateGeoProximityScore(buildingA: string, buildingB: string): {
  score: number;
  distanceKm: number;
  distanceMeters: number;
  text: string;
} {
  const geoA = findBuildingGeo(buildingA);
  const geoB = findBuildingGeo(buildingB);

  if (geoA.id === geoB.id) {
    return {
      score: 100,
      distanceKm: 0,
      distanceMeters: 0,
      text: `Đúng chuẩn cùng tòa ${geoA.name} (0m)`,
    };
  }

  if (geoA.project === geoB.project) {
    const dist = calculateHaversineDistance(geoA.lat, geoA.lng, geoB.lat, geoB.lng);
    const m = Math.round(dist * 1000);
    return {
      score: 98,
      distanceKm: dist,
      distanceMeters: m,
      text: `Cùng cụm dự án ${geoA.project} (cách ~${m}m đi bộ)`,
    };
  }

  const distanceKm = calculateHaversineDistance(geoA.lat, geoA.lng, geoB.lat, geoB.lng);
  const distanceMeters = Math.round(distanceKm * 1000);
  const walkMin = Math.max(1, Math.round(distanceMeters / 75));

  let score = 20;
  let text = `Cách ${distanceKm}km`;

  if (distanceKm <= 0.35) {
    score = 95;
    text = `Rất gần (cùng tuyến phố đi bộ, cách ~${distanceMeters}m, khoảng ${walkMin}p đi bộ)`;
  } else if (distanceKm <= 0.75) {
    score = 85;
    text = `Liền kề cụm (cách ~${distanceMeters}m, khoảng ${walkMin}p đi bộ/xe điện)`;
  } else if (distanceKm <= 1.5) {
    score = 70;
    text = `Lân cận cùng khu vực (cách ~${distanceKm}km)`;
  } else if (distanceKm <= 2.5) {
    score = 45;
    text = `Khác cụm phân khu (cách ~${distanceKm}km)`;
  } else {
    score = 20;
    text = `Khoảng cách xa (cách ~${distanceKm}km)`;
  }

  return { score, distanceKm, distanceMeters, text };
}

// Giữ lại alias ECOPARK_GEO_DATA để tương thích ngược 100% với các module cũ
export const ECOPARK_GEO_DATA = ECOPARK_BUILDINGS;
export function getProjectGeo(projectName: string): EcoparkBuildingGeo {
  return findBuildingGeo(projectName);
}
export function getDistanceBetweenProjects(projectA: string, projectB: string): number {
  return getDistanceBetweenBuildings(projectA, projectB);
}
