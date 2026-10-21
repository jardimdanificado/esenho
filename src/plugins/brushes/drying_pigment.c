#include "quadro_brush_plugin.h"
static int _dry=65,_edge=72,_grain=42,_load=78;
const char* w_brush_get_info(void){return "{\"name\":\"drying_pigment\",\"title\":\"Drying Pigment\",\"category\":\"Paint Physics\",\"spacing\":0.05,\"minRadius\":2,\"maxRadius\":120,\"params\":[{\"name\":\"Drying Texture\",\"min\":0,\"max\":100,\"default\":65,\"unit\":\"%\"},{\"name\":\"Edge Deposit\",\"min\":0,\"max\":100,\"default\":72,\"unit\":\"%\"},{\"name\":\"Paper Grain\",\"min\":0,\"max\":100,\"default\":42,\"unit\":\"%\"},{\"name\":\"Pigment Load\",\"min\":10,\"max\":100,\"default\":78,\"unit\":\"%\"}]}";}
void w_brush_init(int w,int h){}
void w_brush_set_param(int i,int v){if(i==0)_dry=v;else if(i==1)_edge=v;else if(i==2)_grain=v;else if(i==3)_load=v;}
void w_brush_stroke_begin(float x,float y,float p,float tx,float ty,uint32_t c,int e){w_brush_srand((uint32_t)(x*197+y*331+0xD12A));}
void w_brush_stroke_end(void){}
void w_brush_render_dab(uint32_t*px,int w,int h,float cx,float cy,float r,float pressure,float angle,float speed,uint32_t color,int erase){
 if(!px||w<1||h<1||r<1)return;int x0=(int)(cx-r-1),x1=(int)(cx+r+1),y0=(int)(cy-r-1),y1=(int)(cy+r+1);if(x0<0)x0=0;if(y0<0)y0=0;if(x1>=w)x1=w-1;if(y1>=h)y1=h-1;
 float inv=1.0f/(r*r),dry=_dry*.01f,edge=_edge*.01f,grain=_grain*.01f,load=_load*.01f;
 for(int y=y0;y<=y1;y++)for(int x=x0;x<=x1;x++){float dx=x-cx,dy=y-cy,d2=dx*dx+dy*dy;if(d2>r*r)continue;float t=1.0f-d2*inv;
  /* Evaporation leaves pigment at the wet boundary; deterministic paper tooth makes a stable dry finish. */
  float rim=edge/(1.0f+((t-0.20f)*(t-0.20f))*180.0f);
  uint32_t hash=(uint32_t)x*374761393u^(uint32_t)y*668265263u;hash=(hash^(hash>>13))*1274126177u;float tooth=((hash&65535u)/65535.0f-0.5f)*grain;
  float coverage=(0.30f+t*(0.70f-dry*0.18f)+rim*0.55f+tooth*dry)*load*pressure;if(coverage<0.02f)continue;if(coverage>1)coverage=1;
  uint32_t a=(uint32_t)(coverage*255);uint32_t src=(color&0x00ffffffu)|(a<<24);uint32_t*p=&px[y*w+x];if(erase)*p=w_brush_erase(*p,src,255);else *p=w_brush_blend_over(src,*p,255);
 }
}
