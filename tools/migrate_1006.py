"""把作答結果、Email訂閱名單搬成題目順序。舊列（B 欄是「a × b × c」組合）搬欄位，
新列（Code.gs v9 寫的，B 欄是心情或空白）原樣保留。"""
import gspread, sys
DRY = "--go" not in sys.argv
gc=gspread.service_account("/Users/jimmy.wu/spotime-books/sa-key.json")
import os
ss=gc.open_by_key(os.environ["SHEET_ID"])   # 試算表 ID 不進 repo，跑之前 export SHEET_ID=...
NEW_A=['時間','心情','造型','場景','位置','熟悉度','組合','作答秒數','裝置','App','流量來源']
NEW_S=['時間','email','造型','場景','位置','熟悉度','組合','表單','裝置','App','流量來源']
def pad(r,n): return (r+['']*n)[:n]
ws=ss.worksheet("作答結果"); rows=ws.get_all_values(value_render_option="UNFORMATTED_VALUE")
out=[NEW_A]; moved=kept=0
for r in rows[1:]:
    r=pad(r,11)
    if " × " in str(r[1]):  # 舊：時間 組合 造型 場景 位置 裝置 App 來源 熟悉度 心情
        t,c,sh,sc,po,dv,ap,so,fa,mo=r[:10]
        out.append([t,mo,sh,sc,po,fa,c,'',dv,ap,so]); moved+=1
    else: out.append(r); kept+=1
print("作答結果 搬", moved, "保留", kept); print(out[1], out[-1])
ws2=ss.worksheet("Email訂閱名單"); srows=ws2.get_all_values(value_render_option="UNFORMATTED_VALUE")
sout=[NEW_S]
for r in srows[1:]:
    r=pad(r,11)
    if " × " in str(r[2]):  # 舊：時間 email 組合 表單 造型 場景 位置 裝置 App 來源 熟悉度
        t,e,c,f,sh,sc,po,dv,ap,so,fa=r
        sout.append([t,e,sh,sc,po,fa,c,f,dv,ap,so])
    else: sout.append(r)
print("Email", len(sout)-1, sout[1:])
if DRY: sys.exit("dry run")
ws.update(values=out, range_name=f"A1:K{len(out)}", value_input_option="RAW")
ws2.update(values=sout, range_name=f"A1:K{len(sout)}", value_input_option="RAW")
for w,n in ((ws,len(out)),):
    w.format(f"A2:A{max(n,1000)}", {"numberFormat":{"type":"DATE_TIME","pattern":"yyyy/MM/dd HH:mm"}})
ss.worksheet("組合統計（for稀有度計算）").update(values=[["=QUERY('作答結果'!G:G,\"select G, count(G) where G is not null group by G order by count(G) desc label G '組合', count(G) '次數'\",1)"]], range_name="A1", value_input_option="USER_ENTERED")
print("done")
