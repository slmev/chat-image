import type { PromptCategoryInfo, PromptTemplate } from '../types'

// 提示词分类
export const PROMPT_CATEGORIES: PromptCategoryInfo[] = [
  { id: 'people', name: '人物', icon: 'User' },
  { id: 'landscape', name: '风景', icon: 'Mountain' },
  { id: 'products', name: '产品', icon: 'Package' },
  { id: 'animals', name: '动物', icon: 'Bird' },
  { id: 'abstract', name: '抽象', icon: 'Sparkles' },
  { id: 'architecture', name: '建筑', icon: 'Building' },
]

// 提示词模板
export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // 人物
  {
    id: 'people-1',
    category: 'people',
    title: '少女肖像',
    prompt:
      'A beautiful young woman portrait, soft natural lighting, detailed facial features, elegant pose, professional photography',
    description: '柔和光线下的少女肖像',
    tags: ['portrait', 'woman', 'elegant'],
  },
  {
    id: 'people-2',
    category: 'people',
    title: '商务人士',
    prompt:
      'Professional business person in a modern office environment, confident pose, corporate photography style, clean background',
    description: '现代办公环境中的商务人士',
    tags: ['business', 'professional', 'corporate'],
  },
  {
    id: 'people-3',
    category: 'people',
    title: '古风人物',
    prompt:
      'Traditional Chinese ancient style character, flowing robes, cherry blossoms background, artistic illustration, detailed costume design',
    description: '中国传统古风人物形象',
    tags: ['ancient', 'chinese', 'traditional'],
  },
  {
    id: 'people-4',
    category: 'people',
    title: '运动达人',
    prompt:
      'Athletic person in action pose, dynamic sports photography, energetic movement, professional sports lighting',
    description: '充满活力的运动场景',
    tags: ['sports', 'athletic', 'dynamic'],
  },
  {
    id: 'people-5',
    category: 'people',
    title: '奇幻精灵',
    prompt:
      'Fantasy elf character, pointed ears, magical aura, enchanted forest background, ethereal lighting, detailed fantasy art',
    description: '神秘的奇幻精灵角色',
    tags: ['fantasy', 'elf', 'magical'],
  },

  // 风景
  {
    id: 'landscape-1',
    category: 'landscape',
    title: '日落海滩',
    prompt:
      'Stunning beach sunset, golden hour lighting, gentle waves, palm trees silhouettes, vibrant orange and purple sky',
    description: '金色夕阳下的海滩美景',
    tags: ['sunset', 'beach', 'golden'],
  },
  {
    id: 'landscape-2',
    category: 'landscape',
    title: '雪山湖泊',
    prompt:
      'Majestic snow-capped mountains reflected in crystal clear lake, alpine scenery, pristine nature, dramatic clouds',
    description: '雪山倒映在清澈湖泊中',
    tags: ['mountain', 'lake', 'snow'],
  },
  {
    id: 'landscape-3',
    category: 'landscape',
    title: '樱花小径',
    prompt:
      'Cherry blossom lined path, pink petals falling, spring scenery, soft sunlight filtering through trees, peaceful atmosphere',
    description: '樱花盛开的浪漫小径',
    tags: ['cherry', 'spring', 'pink'],
  },
  {
    id: 'landscape-4',
    category: 'landscape',
    title: '星空银河',
    prompt:
      'Stunning night sky with milky way, countless stars, long exposure photography, dark landscape silhouette, astronomical beauty',
    description: '璀璨的星空与银河',
    tags: ['stars', 'milky way', 'night'],
  },
  {
    id: 'landscape-5',
    category: 'landscape',
    title: '热带雨林',
    prompt:
      'Lush tropical rainforest, dense vegetation, misty atmosphere, sunlight rays through canopy, exotic plants, vibrant green',
    description: '生机勃勃的热带雨林',
    tags: ['tropical', 'forest', 'green'],
  },

  // 产品
  {
    id: 'products-1',
    category: 'products',
    title: '电子产品',
    prompt:
      'Sleek modern electronic device, minimalist product photography, clean white background, professional lighting, high-end technology',
    description: '现代电子产品的专业展示',
    tags: ['electronics', 'modern', 'minimal'],
  },
  {
    id: 'products-2',
    category: 'products',
    title: '美食摆盘',
    prompt:
      'Gourmet food presentation, elegant plating, restaurant quality, warm lighting, artistic food photography, appetizing',
    description: '精致的美食摆盘摄影',
    tags: ['food', 'gourmet', 'plating'],
  },
  {
    id: 'products-3',
    category: 'products',
    title: '珠宝首饰',
    prompt:
      'Luxurious jewelry piece, sparkling diamonds, elegant gold setting, macro photography, soft lighting, high detail',
    description: '闪耀的珠宝首饰特写',
    tags: ['jewelry', 'luxury', 'sparkle'],
  },
  {
    id: 'products-4',
    category: 'products',
    title: '护肤品',
    prompt:
      'Premium skincare product, beautiful packaging, fresh natural ingredients, clean aesthetic, beauty product photography',
    description: '高端护肤品的优雅展示',
    tags: ['skincare', 'beauty', 'premium'],
  },
  {
    id: 'products-5',
    category: 'products',
    title: '时尚鞋履',
    prompt:
      'Designer shoes, stylish footwear, fashion photography, dramatic lighting, modern design, premium quality',
    description: '时尚设计师鞋履',
    tags: ['shoes', 'fashion', 'designer'],
  },

  // 动物
  {
    id: 'animals-1',
    category: 'animals',
    title: '可爱猫咪',
    prompt:
      'Adorable fluffy cat, big expressive eyes, soft fur, cute pose, warm indoor lighting, pet photography',
    description: '毛茸茸的可爱猫咪',
    tags: ['cat', 'cute', 'fluffy'],
  },
  {
    id: 'animals-2',
    category: 'animals',
    title: '忠诚狗狗',
    prompt:
      'Happy loyal dog, wagging tail, friendly expression, outdoor natural setting, joyful pet photography',
    description: '快乐忠诚的狗狗',
    tags: ['dog', 'happy', 'loyal'],
  },
  {
    id: 'animals-3',
    category: 'animals',
    title: '野生雄狮',
    prompt:
      'Majestic wild lion, powerful mane, African savanna background, golden hour lighting, wildlife photography, regal presence',
    description: '威严的非洲雄狮',
    tags: ['lion', 'wild', 'majestic'],
  },
  {
    id: 'animals-4',
    category: 'animals',
    title: '海底海豚',
    prompt:
      'Playful dolphins swimming in crystal clear ocean, underwater photography, blue water, dynamic movement, marine life',
    description: '海洋中嬉戏的海豚',
    tags: ['dolphin', 'ocean', 'playful'],
  },
  {
    id: 'animals-5',
    category: 'animals',
    title: '梦幻独角兽',
    prompt:
      'Magical unicorn, rainbow mane, sparkles, enchanted meadow, fantasy art, ethereal glow, mythical creature',
    description: '梦幻般的独角兽',
    tags: ['unicorn', 'fantasy', 'magical'],
  },

  // 抽象
  {
    id: 'abstract-1',
    category: 'abstract',
    title: '流体艺术',
    prompt:
      'Abstract fluid art, vibrant colors flowing and mixing, dynamic movement, acrylic pour painting style, mesmerizing patterns',
    description: '色彩流动的抽象艺术',
    tags: ['fluid', 'colorful', 'dynamic'],
  },
  {
    id: 'abstract-2',
    category: 'abstract',
    title: '几何构成',
    prompt:
      'Geometric abstract composition, bold shapes, modern design, clean lines, minimalist aesthetic, contemporary art',
    description: '现代几何构成设计',
    tags: ['geometric', 'modern', 'minimal'],
  },
  {
    id: 'abstract-3',
    category: 'abstract',
    title: '光影交织',
    prompt:
      'Abstract light and shadow play, bokeh effects, neon lights, urban night photography, colorful illumination',
    description: '光影交织的视觉效果',
    tags: ['light', 'shadow', 'neon'],
  },
  {
    id: 'abstract-4',
    category: 'abstract',
    title: '粒子星尘',
    prompt:
      'Abstract particle dust, cosmic energy, glowing particles, dark space background, ethereal glow, digital art',
    description: '宇宙粒子与星尘',
    tags: ['particles', 'cosmic', 'glow'],
  },
  {
    id: 'abstract-5',
    category: 'abstract',
    title: '水墨意境',
    prompt:
      'Abstract Chinese ink wash painting style, flowing ink, traditional aesthetic, zen atmosphere, artistic brush strokes',
    description: '中国传统水墨意境',
    tags: ['ink', 'chinese', 'zen'],
  },

  // 建筑
  {
    id: 'architecture-1',
    category: 'architecture',
    title: '现代摩天楼',
    prompt:
      'Modern skyscraper architecture, glass facade, urban skyline, dramatic angle, contemporary design, city photography',
    description: '现代城市摩天大楼',
    tags: ['skyscraper', 'modern', 'urban'],
  },
  {
    id: 'architecture-2',
    category: 'architecture',
    title: '古典城堡',
    prompt:
      'Medieval castle, stone walls, dramatic sky, historical architecture, European countryside, majestic presence',
    description: '中世纪欧洲古典城堡',
    tags: ['castle', 'medieval', 'historical'],
  },
  {
    id: 'architecture-3',
    category: 'architecture',
    title: '中式园林',
    prompt:
      'Traditional Chinese garden, pavilion, koi pond, bamboo, moon gate, classical architecture, serene atmosphere',
    description: '宁静优雅的中式园林',
    tags: ['chinese', 'garden', 'traditional'],
  },
  {
    id: 'architecture-4',
    category: 'architecture',
    title: '未来城市',
    prompt:
      'Futuristic cityscape, sci-fi architecture, flying vehicles, neon lights, cyberpunk aesthetic, advanced technology',
    description: '充满科技感的未来城市',
    tags: ['futuristic', 'sci-fi', 'cyberpunk'],
  },
  {
    id: 'architecture-5',
    category: 'architecture',
    title: '日式神社',
    prompt:
      'Japanese shrine, torii gate, cherry blossoms, traditional temple, peaceful garden, zen atmosphere, cultural heritage',
    description: '日式传统神社建筑',
    tags: ['japanese', 'shrine', 'traditional'],
  },
]
