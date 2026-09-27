from pathlib import Path
import hashlib
root=Path('kotoba-android/app/src/main/java/com/studio501/kotoba')
# Only repair the exact invalid variant. The immutable overlay may already
# contain the newer implementation with different identifiers.
fixes={
 'BillingCoordinator.java':('String[] ids=configured.split', '        String[] ids=configured.split("[, ]+");'),
 'EntitlementStore.java':('String[] part=proof.split', '            String[] part=proof.split("[.]");'),
 'MainActivity.java':('return uri.getPath()!=null&&uri.getPath().matches', '        return uri.getPath()!=null&&uri.getPath().matches("/store/account/subscriptions(?:/.*)?");')
}
for name,(needle,replacement) in fixes.items():
    path=root/name
    lines=path.read_text(encoding='utf-8').splitlines()
    found=[i for i,line in enumerate(lines) if needle in line]
    if found:
        assert len(found)==1,(name,found)
        lines[found[0]]=replacement
        path.write_text('\n'.join(lines)+'\n',encoding='utf-8')
        print('Repaired known variant:',name)
    else:
        print('Known invalid variant absent; keeping source:',name)
    print(name,'sha256',hashlib.sha256(path.read_bytes()).hexdigest())
    for i,line in enumerate(path.read_text(encoding='utf-8').splitlines(),1):
        if '.split(' in line or '.matches(' in line:
            print(f'{name}:{i}: {line}')
print('Native source audit complete; javac remains the required validator')
