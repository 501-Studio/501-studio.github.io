from pathlib import Path
root=Path('kotoba-android/app/src/main/java/com/studio501/kotoba')
fixes={
 'BillingCoordinator.java':('String[] ids=configured.split', '        String[] ids=configured.split("[, ]+");'),
 'EntitlementStore.java':('String[] part=proof.split', '            String[] part=proof.split("[.]");'),
 'MainActivity.java':('return uri.getPath()!=null&&uri.getPath().matches', '        return uri.getPath()!=null&&uri.getPath().matches("/store/account/subscriptions(?:/.*)?");')
}
for name,(needle,replacement) in fixes.items():
    path=root/name
    lines=path.read_text(encoding='utf-8').splitlines()
    found=[i for i,line in enumerate(lines) if needle in line]
    assert len(found)==1,(name,found)
    lines[found[0]]=replacement
    path.write_text('\n'.join(lines)+'\n',encoding='utf-8')
print('Repaired three Java string literals')
