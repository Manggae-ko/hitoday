'use strict';
// 손 설계 16×16 도안(2차: 모서리 둥글게). 기호: . 투명  # 외곽선  W 흰  K 검정  O 주황  P 분홍  E 눈  R 방 색  B 볼터치
const OUTLINE = '#4a3a3d';
const EYE = '#241d1a';
const BASE = { W: '#fffdf7', K: '#2f2a33', O: '#f29b3a', P: '#f6a9b8', B: '#ffc4cf' };
const ghost = [
  '................',
  '................',
  '................',
  '......####......',
  '....##WWWW##....',
  '...#WWWWWWWW#...',
  '...#WWWEWEWW#...',
  '...#WWWEWEWW#...',
  '...#WBWWWWBW#...',
  '...#WRRRRRRW#...',
  '...#WWWWWWWW#...',
  '...#WWWWWWWW#...',
  '...#WWWWWWWW#...',
  '...#WWWWWWWW#...',
  '...#W#WWW#WW#...',
  '...##.###.###...',
];
const rabbit = [
  '................',
  '....###..###....',
  '....#P#..#P#....',
  '....#P#..#P#....',
  '....#P#..#P#....',
  '....#WW##WW#....',
  '...#WWWWWWWW#...',
  '...#WWWEWEWW#...',
  '...#WBWEWEWB#...',
  '...#WWWWPWWW#...',
  '...#WRRRRRRW#...',
  '...#WWWWWWWW#...',
  '...#WWWWWWWW#...',
  '...#WWWWWWWW#...',
  '....#WWWWWW#....',
  '....########....',
];
const penguin = [
  '................',
  '................',
  '................',
  '......####......',
  '....##KKKK##....',
  '...#KKKKKKKK#...',
  '...#KWWEWEWWK#..'.slice(0, 16).replace('WWEWEWWK#..', 'KWEWEWK#...'),
  '...#KWWEWEWWK#..'.slice(0, 16).replace('WWEWEWWK#..', 'KWEWEWK#...'),
  '...#KWWOOWWK#...',
  '...#KRRRRRRK#...',
  '...#KWWWWWWK#...',
  '...#KWWWWWWK#...',
  '...#KWWWWWWK#...',
  '...#KKWWWWKK#...',
  '...#OO#KK#OO#...',
  '....########....',
];
const designs = {
  ghost: { grid: ghost, bodyW: 8, maxHeight: 13 },
  rabbit: { grid: rabbit, bodyW: 8, maxHeight: 15 },
  penguin: { grid: penguin, bodyW: 8, maxHeight: 13 },
};
module.exports = { designs, OUTLINE, EYE, BASE };
