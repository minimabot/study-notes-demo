---
chapter: iam/labs
---

@topic iam/labs/setup

이 장은 손으로 해 보는 실습이다. 앞 장에서 읽은 MFA 조건, 역할 수임, 권한 경계, 정책 시뮬레이터, IAM Access Analyzer, 자격 증명 보고서를 AWS CLI로 직접 확인한다. 이름은 모두 `iam-lab`으로 시작한다.

> **요금:** IAM 사용자·그룹·역할·정책, STS, 정책 시뮬레이터, 자격 증명 보고서에는 추가 요금이 없다. IAM Access Analyzer는 **외부 접근 분석기** 만 만든다. 미사용 접근 분석기와 내부 접근 분석기는 분석 대상 수에 따라 요금이 붙으므로 이 실습에서는 만들지 않는다.

준비:

- [ ] AWS CLI 버전 2를 설치하고, IAM·STS·Access Analyzer를 다룰 수 있는 관리용 자격 증명으로 로그인했다
- [ ] 운영 계정이 아닌 실습용 계정이다. 실습 중 만든 사용자에게는 콘솔 암호나 액세스 키를 만들지 않는다
- [ ] 셸에서 계정 ID와 리전을 변수에 담았다

```bash
export AWS_REGION=ap-northeast-2
aws sts get-caller-identity
ACCT=$(aws sts get-caller-identity --query Account --output text)
ME=$(aws sts get-caller-identity --query Arn --output text)
echo $ACCT $ME
```

알아 둘 점:

- 아래 명령은 셸 변수를 이어서 쓴다. 한 셸에서 끝까지 진행한다.
- IAM은 전역 서비스다. 사용자·역할은 리전과 관계없이 계정 전체에 생긴다. Access Analyzer 분석기만 리전 단위다.
- IAM 변경은 바로 반영되지 않을 수 있다. 만든 직후 수임이 실패하면 잠시 뒤 다시 한다.

@topic iam/labs/mfa-group

**목표:** 그룹과 사용자를 만들고, "MFA로 로그인하지 않으면 MFA 설정 말고는 아무것도 못 한다"는 정책을 그룹에 붙인다. 정책 시뮬레이터로 MFA 유무에 따라 결과가 바뀌는지 본다.

```bash
# 1) 그룹 + 사용자 + 소속
aws iam create-group --group-name iam-lab-devs
aws iam create-user --user-name iam-lab-alice
aws iam add-user-to-group --group-name iam-lab-devs --user-name iam-lab-alice

# 2) 그룹 정책: 읽기 작업 허용 + MFA 없으면 MFA 설정 외 모두 거부
cat > mfa.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "ReadOnlyWork", "Effect": "Allow",
      "Action": ["ec2:DescribeInstances", "s3:ListAllMyBuckets"], "Resource": "*" },
    { "Sid": "ManageOwnMfa", "Effect": "Allow",
      "Action": ["iam:CreateVirtualMFADevice", "iam:EnableMFADevice",
                 "iam:ListMFADevices", "iam:ResyncMFADevice", "iam:GetUser"],
      "Resource": ["arn:aws:iam::*:mfa/*", "arn:aws:iam::*:user/${aws:username}"] },
    { "Sid": "DenyAllWithoutMfa", "Effect": "Deny",
      "NotAction": ["iam:CreateVirtualMFADevice", "iam:EnableMFADevice",
                    "iam:ListMFADevices", "iam:ResyncMFADevice", "iam:GetUser",
                    "sts:GetSessionToken"],
      "Resource": "*",
      "Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" } } }
  ]
}
EOF
aws iam put-group-policy --group-name iam-lab-devs --policy-name require-mfa \
  --policy-document file://mfa.json

# 3) 시뮬레이터: MFA 정보 없이 / MFA=false / MFA=true
ALICE=arn:aws:iam::$ACCT:user/iam-lab-alice
aws iam simulate-principal-policy --policy-source-arn $ALICE \
  --action-names ec2:DescribeInstances \
  --query "EvaluationResults[].[EvalActionName,EvalDecision]" --output table
for V in false true; do
  aws iam simulate-principal-policy --policy-source-arn $ALICE \
    --action-names ec2:DescribeInstances s3:ListAllMyBuckets \
    --context-entries "ContextKeyName=aws:MultiFactorAuthPresent,ContextKeyValues=$V,ContextKeyType=boolean" \
    --query "EvaluationResults[].[EvalActionName,EvalDecision]" --output table
done
```

확인:

- [ ] 사용자에게 직접 붙인 정책이 없는데도 시뮬레이터가 그룹 정책을 함께 평가한다
- [ ] 컨텍스트 키를 주지 않은 결과와 `false`를 준 결과가 모두 `explicitDeny`다. `BoolIfExists`는 키가 **없을 때도** 조건을 참으로 본다. 액세스 키로 보낸 요청에는 이 키가 아예 없으므로 `Bool`을 썼다면 키 요청이 거부되지 않는다({{ch:iam/conditions-abac}})
- [ ] `true`를 준 결과는 `allowed`다
- [ ] (선택) 가상 MFA를 실제로 붙여 보려면 `aws iam create-virtual-mfa-device`로 장치를 만들고 인증 앱에 등록한 뒤 `aws iam enable-mfa-device`에 연속된 코드 두 개를 넣는다. 사용자에게 줄 수 있는 MFA 장치 수는 {{fact:iam.mfa.devices.max}}다. 코드는 직접 입력하고 어디에도 저장하지 않는다

@topic iam/labs/role-boundary

**목표:** 내 계정을 신뢰하는 역할을 만들어 `sts assume-role`로 수임한다. 그다음 권한 경계를 붙여, 권한 정책이 허용해도 경계 밖 작업이 거부되는 것을 시뮬레이터와 실제 호출로 본다.

```bash
# 1) 역할: 신뢰 정책은 이 계정, 권한은 IAM 읽기 전용
cat > trust.json <<EOF
{ "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::$ACCT:root" },
    "Action": "sts:AssumeRole" }] }
EOF
ROLE_ARN=$(aws iam create-role --role-name iam-lab-reader \
  --assume-role-policy-document file://trust.json --query Role.Arn --output text)
aws iam attach-role-policy --role-name iam-lab-reader \
  --policy-arn arn:aws:iam::aws:policy/IAMReadOnlyAccess

# 2) 수임하고 임시 자격 증명을 이 셸에만 넣는다
read AK SK ST <<< $(aws sts assume-role --role-arn $ROLE_ARN --role-session-name lab \
  --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text)
AWS_ACCESS_KEY_ID=$AK AWS_SECRET_ACCESS_KEY=$SK AWS_SESSION_TOKEN=$ST \
  aws sts get-caller-identity                          # assumed-role/iam-lab-reader/lab
AWS_ACCESS_KEY_ID=$AK AWS_SECRET_ACCESS_KEY=$SK AWS_SESSION_TOKEN=$ST \
  aws iam list-users --max-items 1                     # 성공
AWS_ACCESS_KEY_ID=$AK AWS_SECRET_ACCESS_KEY=$SK AWS_SESSION_TOKEN=$ST \
  aws iam create-user --user-name iam-lab-nope          # AccessDenied (읽기 전용)

# 3) 권한 경계: 사용자 조회만 허용
cat > boundary.json <<'EOF'
{ "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow",
    "Action": ["iam:ListUsers", "iam:GetUser"], "Resource": "*" }] }
EOF
BND=$(aws iam create-policy --policy-name iam-lab-boundary \
  --policy-document file://boundary.json --query Policy.Arn --output text)
aws iam put-role-permissions-boundary --role-name iam-lab-reader --permissions-boundary $BND

# 4) 시뮬레이터: ListUsers는 경계 안, ListRoles는 경계 밖
aws iam simulate-principal-policy --policy-source-arn $ROLE_ARN \
  --action-names iam:ListUsers iam:ListRoles \
  --query "EvaluationResults[].[EvalActionName,EvalDecision,PermissionsBoundaryDecisionDetail.AllowedByPermissionsBoundary]" \
  --output table

# 5) 새로 수임해 실제로 확인
read AK SK ST <<< $(aws sts assume-role --role-arn $ROLE_ARN --role-session-name lab2 \
  --query "Credentials.[AccessKeyId,SecretAccessKey,SessionToken]" --output text)
AWS_ACCESS_KEY_ID=$AK AWS_SECRET_ACCESS_KEY=$SK AWS_SESSION_TOKEN=$ST \
  aws iam list-roles --max-items 1                     # AccessDenied (경계 밖)
```

확인:

- [ ] `get-caller-identity`의 ARN이 `assumed-role/iam-lab-reader/lab`이다. 수임하는 동안은 원래 권한이 아니라 역할의 권한만 쓴다({{ch:iam/roles}})
- [ ] 수임이 되려면 신뢰 정책(역할 쪽)과 내 자격 증명의 `sts:AssumeRole` 허용(호출자 쪽)이 모두 있어야 한다. 관리용 자격 증명에 이미 있으므로 여기서는 따로 주지 않았다
- [ ] 관리용 자격 증명 자체가 역할 세션(예: IAM Identity Center)이면 이번 수임은 역할 체인이다. 세션 길이가 {{fact:iam.role.chaining.max-session}}을 넘을 수 없다
- [ ] 시뮬레이터에서 `iam:ListUsers`는 `allowed`, `iam:ListRoles`는 `implicitDeny`이고 경계 허용 여부가 `false`다. 권한 정책(`IAMReadOnlyAccess`)은 허용하지만 경계가 허용하지 않아 거부된다. 경계는 권한을 주지 않고 상한만 정한다({{ch:iam/policy-evaluation}})
- [ ] 경계가 거부한 것은 `explicitDeny`가 아니라 `implicitDeny`다. 경계에 `Deny` 문을 쓴 것이 아니기 때문이다
- [ ] 거부 원인을 찾을 때 시뮬레이터 결과의 일치한 문(`MatchedStatements`)과 경계 판정을 먼저 본다. 실제 요청 기록은 CloudTrail로 본다

@topic iam/labs/analyzer-report

**목표:** 계정 단위 외부 접근 분석기를 만들고, 다른 계정이 수임할 수 있는 역할을 일부러 만들어 결과(finding)를 읽는다. 자격 증명 보고서를 받아 사용자별 자격 증명 상태를 본다.

```bash
# 1) 외부 접근 분석기 (신뢰 영역 = 이 계정)
AA=$(aws accessanalyzer create-analyzer --analyzer-name iam-lab-analyzer --type ACCOUNT \
  --query arn --output text)

# 2) 외부 계정(문서 예시 계정 ID)을 신뢰하는 역할. 권한 정책은 붙이지 않는다
cat > ext-trust.json <<'EOF'
{ "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::444455556666:root" },
    "Action": "sts:AssumeRole" }] }
EOF
aws iam create-role --role-name iam-lab-external \
  --assume-role-policy-document file://ext-trust.json

# 3) 몇 분 뒤 결과 읽기
aws accessanalyzer list-findings --analyzer-arn $AA \
  --filter '{"resourceType":{"eq":["AWS::IAM::Role"]},"status":{"eq":["ACTIVE"]}}' \
  --query "findings[].[id,resource,principal.AWS,action[0],isPublic]" --output table
# 한 건 자세히
FID=$(aws accessanalyzer list-findings --analyzer-arn $AA \
  --query "findings[?contains(resource,'iam-lab-external')].id | [0]" --output text)
aws accessanalyzer get-finding --analyzer-arn $AA --id $FID

# 4) 자격 증명 보고서
aws iam generate-credential-report        # State: STARTED → COMPLETE
aws iam get-credential-report --query Content --output text | base64 --decode > report.csv
cut -d, -f1,4,8,9,11 report.csv | column -s, -t | head
```

확인:

- [ ] `iam-lab-external` 역할에 대한 결과가 `ACTIVE`로 생겼고, 주체가 신뢰 영역 밖의 계정 `444455556666`이다. 신뢰 정책만 보고 판단하므로 권한 정책이 없어도 결과가 나온다
- [ ] 같은 계정을 신뢰하는 `iam-lab-reader`는 결과가 없다. 신뢰 영역 안이기 때문이다
- [ ] 의도한 공유라면 결과를 보관(archive)하고, 의도하지 않았다면 신뢰 정책을 고친다. 고치면 결과가 `RESOLVED`로 바뀐다. 분석기 관리는 {{ch:iam/access-analysis}}에서 다룬다
- [ ] Access Analyzer는 리전 단위다. 외부 접근 분석을 쓰려면 리전마다 따로 분석기를 만든다
- [ ] 보고서에 `iam-lab-alice`가 있고 `password_enabled`·`access_key_1_active`가 `false`, `mfa_active`는 MFA를 붙였는지에 따라 다르다. 첫 줄 `<root_account>`는 루트 사용자다
- [ ] 보고서는 {{fact:iam.credential-report.min-interval}}에 한 번만 새로 만들어진다. 그보다 최근 보고서가 있으면 그 보고서를 돌려준다. 바로 다시 받으면 방금 만든 사용자가 빠져 있을 수 있다

@topic iam/labs/cleanup

**목표:** 만든 것을 모두 지운다. IAM은 붙은 정책·소속이 남아 있으면 지우지 못하므로 떼어 내고 지운다.

```bash
# 1) 분석기와 외부 신뢰 역할
aws accessanalyzer delete-analyzer --analyzer-name iam-lab-analyzer
aws iam delete-role --role-name iam-lab-external

# 2) 역할: 경계 제거 → 관리형 정책 분리 → 역할 삭제 → 경계 정책 삭제
aws iam delete-role-permissions-boundary --role-name iam-lab-reader
aws iam detach-role-policy --role-name iam-lab-reader \
  --policy-arn arn:aws:iam::aws:policy/IAMReadOnlyAccess
aws iam delete-role --role-name iam-lab-reader
aws iam delete-policy --policy-arn $BND

# 3) (선택 단계를 했다면) MFA 장치 해제·삭제
aws iam list-mfa-devices --user-name iam-lab-alice --query "MFADevices[].SerialNumber" --output text
# aws iam deactivate-mfa-device --user-name iam-lab-alice --serial-number <위 값>
# aws iam delete-virtual-mfa-device --serial-number <위 값>

# 4) 사용자·그룹
aws iam remove-user-from-group --group-name iam-lab-devs --user-name iam-lab-alice
aws iam delete-user --user-name iam-lab-alice
aws iam delete-group-policy --group-name iam-lab-devs --policy-name require-mfa
aws iam delete-group --group-name iam-lab-devs

# 5) 셸에 남은 임시 자격 증명과 파일
unset AK SK ST
rm -f mfa.json trust.json boundary.json ext-trust.json report.csv
aws iam list-roles --query "Roles[?starts_with(RoleName,'iam-lab')].RoleName"
aws iam list-users --query "Users[?starts_with(UserName,'iam-lab')].UserName"
```

확인:

- [ ] 마지막 두 명령이 빈 목록을 돌려준다
- [ ] 정책이 붙은 역할을 바로 지우려 하면 `DeleteConflict` 오류가 난다. 인라인 정책은 `delete-role-policy`, 관리형 정책은 `detach-role-policy`로 먼저 뗀다. 그룹에 사용자가 남아 있어도 그룹을 지울 수 없다
- [ ] 경계로 쓰던 관리형 정책은 어딘가에 경계로 붙어 있는 동안 지울 수 없다. 역할에서 경계를 먼저 뗀다
- [ ] 역할을 지우지 않고 막기만 하려면 역할 정책을 바꾸고 현재 세션을 모두 취소한다. 세션 취소는 {{ch:iam/roles}}에 있다
- [ ] 자격 증명 보고서 파일은 계정의 자격 증명 상태를 담으므로 공유 폴더에 두지 않는다

@quiz
