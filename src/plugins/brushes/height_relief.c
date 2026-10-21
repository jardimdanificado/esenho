#include "quadro_brush_plugin.h"
#define HM 1024
static unsigned char _height[HM*HM];
static int _depth=65,_soft=48,_light=315,_grain=20;
const char* w_brush_get_info(void){return "{\"name\":\"height_relief\",\"title\":\"Accumulating Height Relief\",\"category\":\"Impasto\",\"spacing\":0.04,\"minRadius\":2,\"maxRadius\":120,\"params\":[{\"name\":\"Relief Depth\",\"min\":1,\"max\":100,\"default\":65,\"unit\":\"%\"},{\"name\":\"Sculpt Softness\",\"min\":0,\"max\":100,\"default\":48,\"unit\":\"%\"},{\"name\":\"Light Direction\",\"min\":0,\"max\":359,\"default\":315,\"unit\":\"deg\"},{\"name\":\"Surface Grain\",\"min\":0,\"max\":100,\"default\":20,\"unit\":\"%\"}]}";}
void w_brush_init(int w,int h){for(int i=0;i<HM*HM;i++)_height[i]=0;}
void w_brush_set_param(int i,int v){if(i==0)_depth=v;else if(i==1)_soft=v;else if(i==2)_light=v;else if(i==3)_grain=v;}
void w_brush_stroke_begin(float x,float y,float p,float tx,float ty,uint32_t c,int e){}
void w_brush_stroke_end(void){}
void w_brush_render_dab(uint32_t*px,int w,int h,float cx,float cy,float r,float pressure,float angle,float speed,uint32_t color,int erase){
 if(!px||w<1||h<1||r<1)return;int x0=(int)(cx-r-2),x1=(int)(cx+r+2),y0=(int)(cy-r-2),y1=(int)(cy+r+2);if(x0<0)x0=0;if(y0<0)y0=0;if(x1>=w)x1=w-1;if(y1>=h)y1=h-1;
 float sx=(HM-1.0f)/w,sy=(HM-1.0f)/h,rad2=r*r,soft=0.15f+_soft*.0085f,dep=_depth*.01f,la=_light*0.0174532925f,lx=w_cosf(la),ly=w_sinf(la);int er=(int)(cx*sx),ey=(int)(cy*sy);
 for(int y=y0;y<=y1;y++)for(int x=x0;x<=x1;x++){float dx=x-cx,dy=y-cy,d2=dx*dx+dy*dy;if(d2>rad2)continue;int hx=(int)(x*sx),hy=(int)(y*sy),hi=hy*HM+hx;float t=1.0f-d2/rad2;int bump=(int)(t*pressure*dep*90.0f);int old=_height[hi],nh=old+bump;if(nh>255)nh=255;_height[hi]=(unsigned char)nh;
  int hx0=hx>0?hx-1:hx,hx1=hx<HM-1?hx+1:hx,hy0=hy>0?hy-1:hy,hy1=hy<HM-1?hy+1:hy;float gx=((int)_height[hy*HM+hx1]-(int)_height[hy*HM+hx0])*sx;float gy=((int)_height[hy1*HM+hx]-(int)_height[hy0*HM+hx])*sy;
  float light=0.80f+(gx*lx+gy*ly)*soft*0.08f;uint32_t hash=(uint32_t)x*374761393u^(uint32_t)y*668265263u;hash=(hash^(hash>>13))*1274126177u;light+=(((hash&255)/255.0f)-0.5f)*(_grain*.001f);if(light<0.25f)light=0.25f;if(light>1.35f)light=1.35f;
  uint32_t rr=(uint32_t)((color&255)*light),gg=(uint32_t)(((color>>8)&255)*light),bb=(uint32_t)(((color>>16)&255)*light);if(rr>255)rr=255;if(gg>255)gg=255;if(bb>255)bb=255;uint32_t src=(color&0xff000000u)|(bb<<16)|(gg<<8)|rr;uint32_t a=(uint32_t)(t*pressure*220.0f);if(a>255)a=255;src=(src&0x00ffffffu)|(a<<24);uint32_t*p=&px[y*w+x];if(erase){if(_height[hi]>bump)_height[hi]-=bump;else _height[hi]=0;*p=w_brush_erase(*p,src,255);}else *p=w_brush_blend_over(src,*p,255);
 }
}
