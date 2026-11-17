// lunar-javascript ships no types; only the calls used in saju.ts are declared.
declare module "lunar-javascript" {
  export class Solar {
    static fromYmd(y: number, m: number, d: number): Solar;
    static fromYmdHms(y: number, m: number, d: number, h: number, mi: number, s: number): Solar;
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getLunar(): Lunar;
  }
  export class Lunar {
    // month < 0 means a leap month
    static fromYmd(y: number, m: number, d: number): Lunar;
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getSolar(): Solar;
    getDayGan(): string;
    getDayInGanZhi(): string;
    getEightChar(): EightChar;
  }
  export class EightChar {
    getYear(): string;
    getMonth(): string;
    getDay(): string;
    getTime(): string;
    getDayGan(): string;
  }
}
